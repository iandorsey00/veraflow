#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
extern "C" int vf_session_placement(void *, int);
int main() {
    HWND window = CreateWindowExW(0, L"STATIC", L"VeraFlow placement test", WS_OVERLAPPEDWINDOW,
                                 100, 100, 900, 650, nullptr, nullptr, GetModuleHandle(nullptr), nullptr);
    if (!window) return 1;
    WINDOWPLACEMENT before = {}; before.length = sizeof(before);
    if (!GetWindowPlacement(window, &before) || !vf_session_placement(window, 1)) return 2;
    SetWindowPos(window, nullptr, 0, 0, 440, 500, SWP_NOZORDER | SWP_NOACTIVATE);
    // Re-entry must not replace the pre-session placement.
    if (!vf_session_placement(window, 1)) return 3;
    ShowWindow(window, SW_MAXIMIZE);
    if (!vf_session_placement(window, 0)) return 4;
    WINDOWPLACEMENT after = {}; after.length = sizeof(after);
    if (!GetWindowPlacement(window, &after) || IsZoomed(window) ||
        !EqualRect(&before.rcNormalPosition, &after.rcNormalPosition)) return 5;
    // Repeated exit is harmless and a later session saves fresh bounds.
    if (!vf_session_placement(window, 0)) return 6;
    SetWindowPos(window, nullptr, 120, 120, 800, 600, SWP_NOZORDER | SWP_NOACTIVATE);
    GetWindowPlacement(window, &before);
    if (!vf_session_placement(window, 1)) return 7;
    SetWindowPos(window, nullptr, 0, 0, 440, 500, SWP_NOZORDER | SWP_NOACTIVATE);
    if (!vf_session_placement(window, 0)) return 8;
    GetWindowPlacement(window, &after);
    if (!EqualRect(&before.rcNormalPosition, &after.rcNormalPosition)) return 9;
    DestroyWindow(window);
    std::puts("Window placement restoration passed (manual Windows 11 Snap check still required).");
    return 0;
}
