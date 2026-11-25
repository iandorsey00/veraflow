# 显示器换货提取演示

请使用带有 **从来源提取…** 功能的版本。所有资料均为虚构。先在浏览器打开[演示粘贴页面](service-destination.html)，再用 VeraFlow 打开[显示器换货表单](service-intake.vf)。

1. 选择 **从来源提取… → 打开文本文件…**，打开[带标签的文本](service-intake-source.txt)。也可以把文件拖入对话框、粘贴原文，或用桌面版一次采集整段已选文字。
2. 查找候选值。型号和联系人等字段有单一候选值；中英文序列号标签给出两个不同值。查看引文并对照网页上的资产标签，选择并勾选应用 `ABC123458`。
3. 应用所选值，再对照资产标签单独核对序列号。可先输入错误的尾号，查看不匹配提示。生成服务工单并粘贴到演示页。发货通知需要补充街道地址。
4. 尝试[邮件原文](service-intake-email.txt)和[邮件候选文件](service-email-candidates.json)。先粘贴原文，再从 **外部提取文件** 导入候选值。核对购买三台但只有一台故障的证据，确认完整地址仍未填写。
5. 用同样方法导入[通话文本](service-intake-call.txt)和[通话候选文件](service-call-candidates.json)。审阅序列号尾数更正，并依据资产标签独立核对。现有值发生冲突时，替换项默认不勾选。

[Python 示例](service-email-extractor.py) 可从虚构邮件中离线提取三个字段。在此文件夹运行以下命令，再导入生成的部分候选文件。可用 `--fields` 指定导出的字段说明，限制脚本输出的字段 ID。

```sh
python3 service-email-extractor.py service-intake-email.txt service-email-partial.json
```
