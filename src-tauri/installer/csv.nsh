; Add a CSV Open with handler while leaving the extension's default value alone.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\VeraFlow.Csv" "" "CSV document"
  WriteRegStr SHCTX "Software\Classes\VeraFlow.Csv\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\.csv\OpenWithProgids" "VeraFlow.Csv" ""
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue SHCTX "Software\Classes\.csv\OpenWithProgids" "VeraFlow.Csv"
  DeleteRegKey SHCTX "Software\Classes\VeraFlow.Csv"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
