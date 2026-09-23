import { setCameraDimensions } from '../handTracking/CameraCoordinates';

const excludedCameraPattern = /redmi|virtual|nvidia|broadcast|obs|capture|screen|phone/i;

function setText(id: string, value: string) {
  const element = document.querySelector<HTMLElement>(`#${id}`);
  if (element) element.textContent = value;
}

/** Owns the webcam stream: device selection, request cancellation and diagnostics. */
export class CameraSession {
  label = '未选择';
  private stream: MediaStream | null = null;
  private deviceId = '';
  private cameras: MediaDeviceInfo[] = [];
  private request = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly signal: AbortSignal,
    private readonly isDisposed: () => boolean,
  ) {}

  get active() { return this.stream !== null; }
  get currentRequest() { return this.request; }
  get frameRate() { return this.stream?.getVideoTracks()[0]?.getSettings().frameRate ?? null; }

  /** Cancels any pending request and releases the current stream. */
  stop() {
    this.request += 1;
    this.release();
  }

  release() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  assertCurrent(id: number, stream?: MediaStream) {
    if (this.isDisposed() || id !== this.request) {
      stream?.getTracks().forEach((track) => track.stop());
      throw new DOMException('Camera request cancelled', 'AbortError');
    }
  }

  async open(requestId: number) {
    const video = this.video;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('当前浏览器不支持摄像头访问');
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    // 先请求一次权限，浏览器才会返回可用的真实设备名称。
    const permissionStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    try {
      this.assertCurrent(requestId, permissionStream);
      this.cameras = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'videoinput');
    } finally { permissionStream.getTracks().forEach((track) => track.stop()); }
    this.assertCurrent(requestId);
    console.table(this.cameras.map((camera) => ({ label: camera.label, deviceId: camera.deviceId.slice(0, 12) })));

    const usbWebcam = this.cameras.find((camera) => /usb webcam/i.test(camera.label) && !excludedCameraPattern.test(camera.label));
    const targetCamera = usbWebcam ?? this.cameras.find((camera) => !excludedCameraPattern.test(camera.label));
    if (!targetCamera) throw new Error('未找到可用的实体 RGB 摄像头（已排除虚拟/红外设备）');

    const request = (width: number, height: number) => navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        deviceId: { exact: targetCamera.deviceId },
        width: { ideal: width }, height: { ideal: height }, frameRate: { ideal: 30, max: 30 },
      },
    });

    let openedStream: MediaStream;
    try {
      openedStream = await request(1280, 720);
    } catch (error) {
      this.assertCurrent(requestId);
      console.warn('1280×720 camera request failed; falling back to 640×480', error);
      openedStream = await request(640, 480);
    }
    this.assertCurrent(requestId, openedStream);
    this.stream = openedStream;

    video.srcObject = openedStream;
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    this.assertCurrent(requestId, openedStream);
    await this.waitForVideoMetadata();
    this.assertCurrent(requestId, openedStream);
    if (video.videoWidth <= 0 || video.videoHeight <= 0) throw new Error('摄像头返回了空视频尺寸');
    setCameraDimensions(video.videoWidth, video.videoHeight);

    const track = openedStream.getVideoTracks()[0];
    this.deviceId = track?.getSettings().deviceId ?? targetCamera.deviceId;
    this.label = targetCamera.label || track?.label || '未命名摄像头';
    console.info('Using camera:', this.label);
    console.info('Video:', `${video.videoWidth} x ${video.videoHeight}`);
    console.info('ReadyState:', video.readyState);
    this.updateDiagnostics();
  }

  updateDiagnostics() {
    const video = this.video;
    const settings = this.stream?.getVideoTracks()[0]?.getSettings();
    const resolution = video.videoWidth > 0 ? `${video.videoWidth} × ${video.videoHeight}` : '—';
    const shortId = this.deviceId ? `${this.deviceId.slice(0, 12)}…` : '—';
    setText('debug-camera-count', String(this.cameras.length));
    setText('debug-camera-active', this.label);
    setText('debug-camera-id', shortId);
    setText('debug-camera-resolution', resolution);
    setText('debug-camera-fps', settings?.frameRate ? `${Math.round(settings.frameRate)}` : '—');
    setText('debug-camera-mirror', 'ON');
    setText('debug-input-size', resolution);
    setText('camera-debug-label', this.label);
    setText('camera-debug-resolution', resolution);
    setText('camera-debug-ready', String(video.readyState));
    setText('camera-debug-id', shortId);
  }

  private async waitForVideoMetadata() {
    const video = this.video;
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth > 0) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => { window.clearTimeout(timeout); video.removeEventListener('loadedmetadata', onLoaded); this.signal.removeEventListener('abort', onAbort); };
      const onLoaded = () => { cleanup(); resolve(); };
      const onAbort = () => { cleanup(); reject(new DOMException('Camera request cancelled', 'AbortError')); };
      const timeout = window.setTimeout(() => { cleanup(); reject(new Error('摄像头视频元数据超时')); }, 7000);
      video.addEventListener('loadedmetadata', onLoaded, { once: true });
      this.signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
