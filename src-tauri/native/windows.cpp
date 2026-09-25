#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <string>
#include <vector>
#include <cstdlib>
#include <cstring>
#include <cwchar>
struct ClipItem { UINT format; std::vector<unsigned char> data; };
static bool openClip() { for (int i=0;i<20;i++) { if (OpenClipboard(NULL)) return true; Sleep(10); } return false; }
static char *readOpen() {
    HANDLE h=GetClipboardData(CF_UNICODETEXT); if (!h) return nullptr;
    SIZE_T size=GlobalSize(h); const wchar_t *p=(const wchar_t*)GlobalLock(h); if (!p) return nullptr;
    size_t n=0; while ((n+1)*sizeof(wchar_t)<=size && p[n]) n++;
    if ((n+1)*sizeof(wchar_t)>size || n>4*1024*1024) { GlobalUnlock(h); return nullptr; }
    int bytes=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,p,(int)n,NULL,0,NULL,NULL);
    char *out=bytes>0?(char*)malloc(bytes+1):nullptr;
    if(out) { WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,p,(int)n,out,bytes,NULL,NULL); out[bytes]=0; }
    GlobalUnlock(h); return out;
}
extern "C" void vf_free(char *p) { free(p); }
extern "C" char *vf_read(int *error) { if(!openClip()){*error=8;return nullptr;} char *s=readOpen(); CloseClipboard(); if(!s)*error=1;return s; }
extern "C" int vf_write(const char *text) {
    int count=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text,-1,NULL,0); if(!count) return 1;
    HGLOBAL memory=GlobalAlloc(GMEM_MOVEABLE,count*sizeof(wchar_t)); if(!memory)return 1;
    void *p=GlobalLock(memory); if(!p){GlobalFree(memory);return 1;}
    MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,text,-1,(wchar_t*)p,count); GlobalUnlock(memory);
    if(!openClip()){GlobalFree(memory);return 1;}
    // A real owner is required by EmptyClipboard / SetClipboardData.
    CloseClipboard(); HWND owner=CreateWindowExW(0,L"STATIC",L"",0,0,0,0,0,HWND_MESSAGE,NULL,GetModuleHandle(NULL),NULL);
    if(!owner){GlobalFree(memory);return 1;}
    if(!OpenClipboard(owner)){DestroyWindow(owner);GlobalFree(memory);return 1;}
    bool ok=EmptyClipboard() && SetClipboardData(CF_UNICODETEXT,memory); CloseClipboard(); DestroyWindow(owner);
    if(!ok)GlobalFree(memory); return ok?0:1;
}
static bool external(HWND window) { DWORD pid=0; GetWindowThreadProcessId(window,&pid); return window && pid!=GetCurrentProcessId(); }
extern "C" char *vf_capture(int restore,int *error) {
    HWND source=GetForegroundWindow(); if(!external(source)){*error=2;return nullptr;}
    if(!openClip()){*error=8;return nullptr;}
    DWORD sequence=GetClipboardSequenceNumber(); std::vector<ClipItem> snapshot; size_t total=0;
    if(restore) {
        UINT format=0;
        while(true) {
            SetLastError(ERROR_SUCCESS);
            format=EnumClipboardFormats(format);
            if(!format) {
                if(GetLastError()!=ERROR_SUCCESS){CloseClipboard();*error=4;return nullptr;}
                break;
            }
            // Only formats documented to use HGLOBAL. Refuse owner-display/GDI/private handles.
            wchar_t formatName[128]={};
            bool registeredSafe=format>=0xC000 && GetClipboardFormatNameW(format,formatName,128) && (!wcscmp(formatName,L"HTML Format") || !wcscmp(formatName,L"Rich Text Format") || !wcscmp(formatName,L"PNG"));
            bool allowed=format==CF_TEXT || format==CF_UNICODETEXT || format==CF_OEMTEXT || format==CF_LOCALE || format==CF_DIB || format==CF_DIBV5 || format==CF_HDROP || registeredSafe;
            if(!allowed){CloseClipboard();*error=4;return nullptr;}
            HANDLE h=GetClipboardData(format); SIZE_T size=h?GlobalSize(h):0; total+=size;
            void *p=size?GlobalLock(h):nullptr;
            if(!p || total>32*1024*1024){if(p)GlobalUnlock(h);CloseClipboard();*error=4;return nullptr;}
            ClipItem item{format,std::vector<unsigned char>((unsigned char*)p,(unsigned char*)p+size)}; GlobalUnlock(h); snapshot.push_back(std::move(item));
        }
    }
    CloseClipboard();
    for(int i=0;i<100;i++) {
        if(!((GetAsyncKeyState(VK_CONTROL)|GetAsyncKeyState(VK_SHIFT)|GetAsyncKeyState(VK_MENU)|GetAsyncKeyState(VK_LWIN)|GetAsyncKeyState(VK_RWIN))&0x8000))break;
        Sleep(10); if(i==99){*error=5;return nullptr;}
    }
    if(GetForegroundWindow()!=source || GetClipboardSequenceNumber()!=sequence){*error=6;return nullptr;}
    INPUT keys[4]={}; for(auto &key:keys)key.type=INPUT_KEYBOARD;
    keys[0].ki.wVk=VK_CONTROL; keys[1].ki.wVk='C'; keys[2].ki.wVk='C';keys[2].ki.dwFlags=KEYEVENTF_KEYUP;keys[3].ki.wVk=VK_CONTROL;keys[3].ki.dwFlags=KEYEVENTF_KEYUP;
    if(SendInput(4,keys,sizeof(INPUT))!=4){ // release potentially injected keys if UIPI interrupted the sequence
        SendInput(2,keys+2,sizeof(INPUT)); *error=5;return nullptr;
    }
    bool changed=false;for(int i=0;i<100;i++){Sleep(10);if(GetClipboardSequenceNumber()!=sequence){changed=true;break;}}
    if(!changed){*error=5;return nullptr;}
    DWORD captured=GetClipboardSequenceNumber();
    HWND owner=CreateWindowExW(0,L"STATIC",L"",0,0,0,0,0,HWND_MESSAGE,NULL,GetModuleHandle(NULL),NULL);
    if(!owner){*error=8;return nullptr;}
    bool opened=false;for(int i=0;i<20;i++){if(OpenClipboard(owner)){opened=true;break;}Sleep(10);}
    if(!opened){DestroyWindow(owner);*error=8;return nullptr;}
    if(GetClipboardSequenceNumber()!=captured || GetForegroundWindow()!=source){CloseClipboard();DestroyWindow(owner);*error=6;return nullptr;}
    char *value=readOpen();
    if(restore) {
        // Allocate every replacement before destroying the current clipboard.
        std::vector<HGLOBAL> handles;
        for(auto &item:snapshot){HGLOBAL h=GlobalAlloc(GMEM_MOVEABLE,item.data.size());void *p=h?GlobalLock(h):nullptr;
            if(!p){if(h)GlobalFree(h);for(auto old:handles)GlobalFree(old);free(value);CloseClipboard();DestroyWindow(owner);*error=7;return nullptr;}
            memcpy(p,item.data.data(),item.data.size());GlobalUnlock(h);handles.push_back(h);}
        bool ok=EmptyClipboard()!=0;
        for(size_t i=0;i<handles.size();i++){if(!ok || !SetClipboardData(snapshot[i].format,handles[i])){GlobalFree(handles[i]);ok=false;}}
        if(!ok){free(value);value=nullptr;*error=7;}
    }
    CloseClipboard();DestroyWindow(owner);if(!value && !*error)*error=1;return value;
}
