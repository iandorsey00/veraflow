// Pure conversion checks; never reads or writes the system clipboard.
#import "../../src-tauri/native/macos.m"
#include <assert.h>
int main(void) {
    @autoreleasepool {
        int error = 0;
        char *text = copyString(@"客户姓名 — café", &error);
        assert(text && !error && strcmp(text, "客户姓名 — café") == 0);
        vf_free(text);
        unichar characters[] = {'A', 0, 'B'};
        NSString *embedded = [NSString stringWithCharacters:characters length:3];
        assert(copyString(embedded, &error) == NULL && error == 9);
    }
    return 0;
}
