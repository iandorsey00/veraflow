VeraFlow 0.26.1 is a Desktop packaging correction for the macOS preview. Replace the 0.26.0 Mac app with the Apple Silicon or Intel ZIP for your Mac.

The macOS app bundles use ad hoc signing to seal their resources. The release checks bundle integrity after extracting both the installation ZIP and updater archive. Developer ID signing and Apple notarization are pending. macOS may require a per-app authorization in Privacy & Security on first launch. The Windows x64 preview remains publisher unsigned. The updater packages use VeraFlow's existing signatures. Compare downloads with `SHA256SUMS.txt`.

### 简体中文

VeraFlow 0.26.1 修复 macOS 预览版的打包问题。请根据芯片类型选择 Apple 芯片或 Intel 的 ZIP，替换 0.26.0 版应用。

macOS 应用包使用临时签名（ad hoc）封存资源。发布流程会解压安装 ZIP 和更新包，核验应用包的签名完整性。Developer ID 签名和 Apple 公证尚未完成，首次启动时可能需要在「隐私与安全性」中单独授权。Windows x64 预览版尚无发布者签名。更新包仍使用核流原有的更新签名。请用 `SHA256SUMS.txt` 核对下载文件。
