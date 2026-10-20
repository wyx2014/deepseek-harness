# Agent Note: PromptHub 系统浏览器认证

Status: implemented

[English](2026-10-19-prompthub-system-browser-login.md) | 中文

## 问题

桌面登录需要复用用户的 PromptHub 浏览器会话，并同时更新侧栏与技能商店。独立 Electron 网站窗口无法访问该浏览器会话。仅打开网站也无法向 Desktop 提供账号确认或凭证返回路径。

## 决策

[DesktopPromptHub](../../../../apps/desktop/src/prompt-hub.ts) 启动绑定 `127.0.0.1` 的临时监听，并通过系统浏览器打开 PromptHub `/desktop/authorize` 页面。URL 只包含回调地址和新生成的随机 state，不携带凭证。网站校验该地址，复用已有会话或跳转到密码登录页，并要求用户明确确认账号。网站通过 JSON 将 token 和 state POST 至本机回调。Desktop 校验 Origin、Host、路径与 state，限制请求大小，只接受一次确认。

工具箱 Host 验证 `users:me` 后才写入既有、绑定 endpoint 的 `toolbox-prompthub/session` 凭证 grant。侧栏与技能商店共用此 grant，包括重启恢复与退出登录。无效的新 token 保留已有 grant。应用渲染进程仅通过应用主文档桥接接收账号资料、进度与安全错误。浏览器在 Host 完成验证和存储后才显示成功。

成功、失败、取消和超时都会关闭监听及其连接。确认前取消会阻止凭证提交；提交已开始时，退出登录或关闭应用会先等待其完成。关闭浏览器标签页无法取消监听，因此该情况由桌面取消操作与配置的超时负责。

## 考虑过的替代方案

**独立 Electron 登录窗口**无需修改网站就能读取网站 token，但无法复用用户的浏览器会话，需要重复输入密码。系统浏览器提供所需的会话复用。

**仅打开原登录 URL 而没有回调**无法同步 Desktop 状态。授权页和本机回调提供缺少的确认与返回路径，无需再建一套账号服务。

**桌面密码表单**会重复网站认证流程。PromptHub 继续负责其登录表单与认证策略。

**独立的桌面 token 存储**会造成侧栏与技能商店存在相互竞争的身份。既有 Host grant 已负责持久化、endpoint 绑定与退出登录。使用重定向 URL 而非 POST 传递 bearer token 会将其暴露在地址历史和 URL 诊断信息中。

## 影响

PromptHub 网站与 Desktop 均需支持此流程；网站集成依赖其 token 存储键及已认证用户查询协议。桌面退出保留浏览器的网站会话，下次登录只需确认。浏览器可能要求用户允许连接本机应用。普通 Web 缺少此私有原生桥接。DeepSeek 账号和 Platform provider 保留各自独立的协议。

原生测试覆盖回调校验、取消、超时、重复提交、无效凭证及提交期间退出。本地 smoke 使用实际 Vue 构建、独立 Chrome 进程、已编译 Electron 认证与 Host Gateway，验证密码登录、已有会话确认、重启恢复、共享退出和安全失败。fixture 使用临时浏览器与凭证目录；部署网站的认证仍需单独验证。
