## Desktop and CLI 0.27.0

Phase 1 adds portable workflow definitions, persistent instances, a response inbox, and a local autofill queue. Open **Workflows** in Desktop to reach the dashboard. Start the worker from a source checkout with Node.js 24 and Playwright Chromium. See the [workflow guide and fictional demo](https://github.com/iandorsey00/veraflow/blob/v0.27.0/docs/workflow-automation.md).

In Experiment 11, the operator confirmed that a live Google Forms answer reached the Drive-synchronized inbox, was transformed and held for independent verification, and then filled five destination fields with zero readback mismatches on the first run. The operator also confirmed duplicate handling, restart recovery, respondent isolation, and the global stop switch for queued work. The second populated page was visually checked and its internal report was unavailable. The release tests cover simulated exports and failure scenarios beyond the reported live checks.

Google Forms setup and closure are manual. The browser adapter fills the bundled fictional employment page and leaves it for human review. Arbitrary URLs, multipage navigation, and automatic final submission are outside this release. Web remains at 0.6.0.

The Apple Silicon and Intel bundles use ad hoc signing. Developer ID signing and notarization are pending, and macOS may require per-app authorization on first launch. The Windows installer remains publisher unsigned. Updater packages carry VeraFlow's existing update signatures. Compare downloads with `SHA256SUMS.txt`.

## 桌面版和命令行 0.27.0

第一阶段新增可移植的工作流定义、持久化实例、答复收件箱及本地自动填写队列。在桌面版点击 **工作流** 打开控制台。后台进程需在源码目录中使用 Node.js 24 和 Playwright Chromium 启动。请参阅[工作流指南与虚构示例](https://github.com/iandorsey00/veraflow/blob/v0.27.0/docs/workflow-automation.zh-CN.md)。

实验 11 中，操作者确认在线 Google Forms 答复通过 Drive 同步进入收件箱，经过配置的转换和独立核验后，首次运行填写了五个目标字段，读回结果全部一致。操作者还验证了重复答复处理、重启恢复、答复者记录隔离及针对排队任务的全局停止开关。第二次执行仅确认了页面可见值，发布审查未获得其内部读回报告。发布测试另行覆盖模拟导出及故障场景。

Google Forms 仍需手动创建、发布及关闭。浏览器适配器仅填写内置的虚构就业信息页面，并保留页面供人工复核。本版本未实现任意网址、多页导航或自动最终提交。网页版保持 0.6.0。

Apple 芯片与 Intel 安装包均使用临时签名（ad hoc）。Developer ID 签名和 Apple 公证尚未完成，首次启动时可能需要单独授权。Windows 安装程序仍无发布者签名。更新包继续使用核流原有的更新签名。请用 `SHA256SUMS.txt` 核对下载文件。
