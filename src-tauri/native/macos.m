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
        for (int i = 0; i < 100; i++) {
            CGEventFlags flags = CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState);
            if (!(flags & (kCGEventFlagMaskCommand | kCGEventFlagMaskControl | kCGEventFlagMaskAlternate | kCGEventFlagMaskShift))) break;
            usleep(10000);
            if (i == 99) { *error = 5; return NULL; }
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
int vf_deliver(const char *text, int tab) {
    @autoreleasepool {
        if (!externalApp()) return 2;
        if (!AXIsProcessTrusted()) return 3;
        pid_t target = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
        for (int i = 0; i < 100; i++) {
            CGEventFlags flags = CGEventSourceFlagsState(kCGEventSourceStateCombinedSessionState);
            if (!(flags & (kCGEventFlagMaskCommand | kCGEventFlagMaskControl | kCGEventFlagMaskAlternate | kCGEventFlagMaskShift))) break;
            usleep(10000); if (i == 99) return 5;
        }
        if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != target) return 6;
        CGEventRef down = CGEventCreateKeyboardEvent(NULL, text ? 9 : 48, true);
        CGEventRef up = CGEventCreateKeyboardEvent(NULL, text ? 9 : 48, false);
        CGEventRef td = CGEventCreateKeyboardEvent(NULL, 48, true);
        CGEventRef tu = CGEventCreateKeyboardEvent(NULL, 48, false);
        if (!down || !up || !td || !tu) {
            if (down) CFRelease(down); if (up) CFRelease(up); if (td) CFRelease(td); if (tu) CFRelease(tu); return 8;
        }
        if (text && vf_write(text)) { CFRelease(down); CFRelease(up); CFRelease(td); CFRelease(tu); return 8; }
        if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != target) { CFRelease(down); CFRelease(up); CFRelease(td); CFRelease(tu); return 6; }
        CGEventSetFlags(td, 0); CGEventSetFlags(tu, 0);
        CGEventFlags flags = text ? kCGEventFlagMaskCommand : kCGEventFlagMaskShift;
        CGEventSetFlags(down, flags); CGEventSetFlags(up, flags);
        CGEventPost(kCGHIDEventTap, down); CGEventPost(kCGHIDEventTap, up);
        int result = 0;
        if (text && tab) {
            usleep(200000);
            if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != target) result = 6;
            else { CGEventPost(kCGHIDEventTap, td); CGEventPost(kCGHIDEventTap, tu); }
        }
        CFRelease(down); CFRelease(up); CFRelease(td); CFRelease(tu);
        return result;
    }
}
