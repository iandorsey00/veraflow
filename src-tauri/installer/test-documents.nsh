; The test installer offers an alternate opener for each extension.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\VeraFlow.Test.Template" "" "VeraFlow Test template"
  WriteRegStr SHCTX "Software\Classes\VeraFlow.Test.Template\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\VeraFlow.Test.Csv" "" "CSV document"
  WriteRegStr SHCTX "Software\Classes\VeraFlow.Test.Csv\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "VeraFlow Test"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".veraflow" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".vf" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".csv" ""
  WriteRegStr SHCTX "Software\Classes\.veraflow\OpenWithProgids" "VeraFlow.Test.Template" ""
  WriteRegStr SHCTX "Software\Classes\.vf\OpenWithProgids" "VeraFlow.Test.Template" ""
  WriteRegStr SHCTX "Software\Classes\.csv\OpenWithProgids" "VeraFlow.Test.Csv" ""
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue SHCTX "Software\Classes\.veraflow\OpenWithProgids" "VeraFlow.Test.Template"
  DeleteRegValue SHCTX "Software\Classes\.vf\OpenWithProgids" "VeraFlow.Test.Template"
  DeleteRegValue SHCTX "Software\Classes\.csv\OpenWithProgids" "VeraFlow.Test.Csv"
  DeleteRegKey SHCTX "Software\Classes\VeraFlow.Test.Template"
  DeleteRegKey SHCTX "Software\Classes\VeraFlow.Test.Csv"
  DeleteRegKey SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
