#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdio>
extern "C" int vf_session_placement(void *, int);
int main() {
    SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
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
    // Invocation and resize threads may have different DPI awareness. Repeated
    // sessions must restore the same physical rectangle without scaling growth.
    RECT physicalBefore = {}; GetWindowRect(window, &physicalBefore);
    for (int round = 0; round < 3; ++round) {
        auto previous = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_UNAWARE);
        if (!vf_session_placement(window, 1)) return 10;
        // The native helper must restore its caller's awareness context.
        if (!AreDpiAwarenessContextsEqual(GetThreadDpiAwarenessContext(), DPI_AWARENESS_CONTEXT_UNAWARE)) return 11;
        SetThreadDpiAwarenessContext(previous);
        SetWindowPos(window, nullptr, 0, 0, 360, 690, SWP_NOZORDER | SWP_NOACTIVATE);
        previous = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_SYSTEM_AWARE);
        if (!vf_session_placement(window, 0)) return 12;
        SetThreadDpiAwarenessContext(previous);
        RECT physicalAfter = {}; GetWindowRect(window, &physicalAfter);
        if (!EqualRect(&physicalBefore, &physicalAfter)) return 13;
    }
    DestroyWindow(window);
    std::puts("Window placement restoration passed (manual Windows 11 Snap check still required).");
    return 0;
}
