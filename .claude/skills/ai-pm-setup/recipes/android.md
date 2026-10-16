# 配方：安卓手机（adb + mobile-mcp）

适用 Mac、Windows（ARM64 Windows 暂不支持）。adb 先复用 Android Studio、`ANDROID_HOME` 或 PATH，没有才下载到 `~/.ai-pm/tools/android-sdk/`；下载前展示官方许可条款并核对指纹。

手机上打开开发者选项和 USB 调试，连接后点「允许」。小米还要打开「USB 调试（安全设置）」。Windows 缺驱动时由用户以管理员身份安装官方 USB 驱动。多台手机必须登记 `device_serial`。自检会读取界面结构和内存截图；截图可能含通知栏验证码，分享前先检查。
