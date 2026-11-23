# Sharkord

自托管的实时沟通平台，把文字频道、私信与语音频道（含摄像头与屏幕共享）带给运营者自己的基础设施。

## Language

**Voice Runtime**:
服务器上承载语音频道实时媒体交换的运行时。加入频道的成员经由它与同频道其他人互传语音、摄像头与屏幕共享画面。
_Avoid_: voice server, SFU server, 语音服务器, media server

**Edge Ingress**:
部署在比主服更靠近用户的网络位置、把实时媒体加速接入主服务的入口。它不承载会话状态，同一频道的媒体始终汇聚在主服务的 Voice Runtime。
_Avoid_: 中转服务器, relay server, proxy, voice server
