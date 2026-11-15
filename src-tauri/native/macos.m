#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#include <unistd.h>
#include <stdlib.h>
#include <string.h>

// All results use a single owned allocation, released by vf_free in the same runtime.
static char *copyString(NSString *s, int *error) {
    if (!s) return NULL;
    const char *utf8 = s.UTF8String;
    // Reject embedded NUL or unrepresentable text rather than silently truncating it.
    if (!utf8 || strlen(utf8) != [s lengthOfBytesUsingEncoding:NSUTF8StringEncoding]) { *error = 9; return NULL; }
    return strdup(utf8);
}
void vf_free(char *p) { free(p); }
static BOOL externalApp(void) { return NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != getpid(); }
char *vf_read(int *error) {
    @autoreleasepool { NSString *s = [NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString];
        if (!s.length) { *error = 1; return NULL; } return copyString(s, error); }
}
int vf_write(const char *text) {
    @autoreleasepool { NSPasteboard *pb = NSPasteboard.generalPasteboard;
        NSString *s = [NSString stringWithUTF8String:text]; if (!s) return 1;
        [pb clearContents]; return [pb setString:s forType:NSPasteboardTypeString] ? 0 : 1; }
}
// Hold the application identity only while the optional mouse panel is active.
static NSRunningApplication *mouseSource = nil;
int vf_mouse_source(int enabled) {
    @autoreleasepool {
        if(!enabled){mouseSource=nil;return 0;}
        NSRunningApplication *current=NSWorkspace.sharedWorkspace.frontmostApplication;
        if(current && current.processIdentifier!=getpid())mouseSource=current;
        return mouseSource && !mouseSource.terminated;
    }
}
int vf_focus_source(void) {
    @autoreleasepool {
        if(!mouseSource || mouseSource.terminated)return 2;
        [mouseSource activateWithOptions:0];
        for(int i=0;i<30;i++){
            if(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier==mouseSource.processIdentifier)return 0;
            usleep(10000);
        }
        return 2;
    }
}
char *vf_capture(int restore, int *error) {
    @autoreleasepool {
        if (!externalApp()) { *error = 2; return NULL; }
        if (!AXIsProcessTrusted()) { *error = 3; return NULL; }
        pid_t directSource = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
        AXUIElementRef system = AXUIElementCreateSystemWide();
        CFTypeRef focused = NULL, selected = NULL;
        AXUIElementCopyAttributeValue(system, kAXFocusedUIElementAttribute, &focused);
        if (focused) AXUIElementCopyAttributeValue((AXUIElementRef)focused, kAXSelectedTextAttribute, &selected);
        char *direct = NULL;
        if (selected && CFGetTypeID(selected) == CFStringGetTypeID() && CFStringGetLength(selected) > 0)
            direct = copyString((__bridge NSString *)selected, error);
        if (selected) CFRelease(selected); if (focused) CFRelease(focused); CFRelease(system);
        if (*error) return NULL;
        if (direct) {
            if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != directSource) { free(direct); *error = 6; return NULL; }
            return direct;
        }

        NSPasteboard *pb = NSPasteboard.generalPasteboard;
        NSInteger originalCount = pb.changeCount;
        NSMutableArray<NSPasteboardItem *> *snapshot = [NSMutableArray array];
        if (restore) {
            NSUInteger total = 0;
            for (NSPasteboardItem *item in pb.pasteboardItems) {
                NSPasteboardItem *saved = [[NSPasteboardItem alloc] init];
                for (NSPasteboardType type in item.types) {
                    NSData *data = [item dataForType:type]; total += data.length;
                    if (!data || total > 32 * 1024 * 1024) { *error = 4; return NULL; }
                    [saved setData:data forType:type];
                }
                [snapshot addObject:saved];
            }
        }
        pid_t source = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
        // Let the user's shortcut modifiers go before synthesizing Cmd+C.
        for (int i = 0; i < 300; i++) {
            CGEventFlags flags = CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState);
            if (!(flags & (kCGEventFlagMaskCommand | kCGEventFlagMaskControl | kCGEventFlagMaskAlternate | kCGEventFlagMaskShift))) break;
            usleep(10000);
            if (i == 299) { *error = 10; return NULL; }
        }
        if (pb.changeCount != originalCount || NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != source || !externalApp()) { *error = 6; return NULL; }
        CGEventRef down = CGEventCreateKeyboardEvent(NULL, 8, true), up = CGEventCreateKeyboardEvent(NULL, 8, false);
        if (!down || !up) { if (down) CFRelease(down); if (up) CFRelease(up); *error = 5; return NULL; }
        CGEventSetFlags(down, kCGEventFlagMaskCommand); CGEventSetFlags(up, kCGEventFlagMaskCommand);
        CGEventPost(kCGHIDEventTap, down); CGEventPost(kCGHIDEventTap, up); CFRelease(down); CFRelease(up);
        BOOL changed = NO;
        for (int i = 0; i < 100; i++) { usleep(10000); if (pb.changeCount != originalCount) { changed = YES; break; } }
        if (!changed) { *error = 5; return NULL; }
        NSInteger capturedCount = pb.changeCount;
        NSString *value = [[pb stringForType:NSPasteboardTypeString] copy];
        if (pb.changeCount != capturedCount || NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != source) { *error = 6; return NULL; }
        // NSPasteboard has no atomic compare-and-swap. Recheck immediately before restoration.
        if (restore && pb.changeCount == capturedCount) {
            [pb clearContents];
            if (snapshot.count && ![pb writeObjects:snapshot]) { *error = 7; return NULL; }
        }
        if (!value.length) { *error = 1; return NULL; }
        return copyString(value, error);
    }
}

// Deliberate output only: Paste and Tab/Shift+Tab, never Return or Send.
uintptr_t vf_delivery_target(void) {
    pid_t pid = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
    return pid > 0 && pid != getpid() ? (uintptr_t)pid : 0;
}
static int sendKey(CGKeyCode code, CGEventFlags flags) {
    CGEventRef down = CGEventCreateKeyboardEvent(NULL, code, true);
    CGEventRef up = CGEventCreateKeyboardEvent(NULL, code, false);
    if (!down || !up) {
        if (down) CFRelease(down);
        if (up) CFRelease(up);
        return 8;
    }
    CGEventSetFlags(down, flags); CGEventSetFlags(up, flags);
    CGEventPost(kCGHIDEventTap, down); CGEventPost(kCGHIDEventTap, up);
    CFRelease(down); CFRelease(up);
    return 0;
}
int vf_deliver(const char *text, const unsigned char *keys, size_t count, uintptr_t expected) {
    @autoreleasepool {
        uintptr_t target = vf_delivery_target();
        if (!target || (expected && target != expected)) return 2;
        if (!AXIsProcessTrusted()) return 3;
        for (int i = 0; i < 300; i++) {
            CGEventFlags flags = CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState);
            if (!(flags & (kCGEventFlagMaskCommand | kCGEventFlagMaskControl | kCGEventFlagMaskAlternate | kCGEventFlagMaskShift))) break;
            usleep(10000); if (i == 299) return 10;
        }
        if (vf_delivery_target() != target) return 6;
        if (text && vf_write(text)) return 8;
        if (vf_delivery_target() != target) return 6;
        int result = sendKey(text ? 9 : 48, text ? kCGEventFlagMaskCommand : kCGEventFlagMaskShift);
        if (result || !text) return result;
        if (count || expected) usleep(200000);
        for (size_t i = 0; i < count; i++) {
            if (vf_delivery_target() != target) return 6;
            result = sendKey(48, keys[i] ? kCGEventFlagMaskShift : 0);
            if (result) return result;
            usleep(90000);
        }
        return vf_delivery_target() == target ? 0 : 6;
    }
}
