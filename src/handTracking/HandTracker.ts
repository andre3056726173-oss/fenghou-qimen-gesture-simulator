import type { HandLandmarker as HandLandmarkerType } from '@mediapipe/tasks-vision';
import type { TrackingFrame, TrackedHand } from '../types';
import { validHandLandmarks } from './FrameSampleGate';

const WASM_ROOT = '/mediapipe/wasm';
const MODEL_URL = '/mediapipe/models/hand_landmarker.task';

export type TrackerStatus = 'idle' | 'loading' | 'ready' | 'denied' | 'error';

export class HandTracker {
  private detector: HandLandmarkerType | null = null;
  private video: HTMLVideoElement;
  private lastVideoTime = -1;
  private sampleCount = 0;
  private sampleWindowStart = performance.now();
  private measuredFps = 0;
  private lastFrame: TrackingFrame | null = null;
  status: TrackerStatus = 'idle';
  private lifecycle = 0;

  constructor(video: HTMLVideoElement) { this.video = video; }

  async initialize(onStatus?: (status: TrackerStatus, message: string) => void) {
    const lifecycle = this.lifecycle;
    if (this.detector) {
      this.status = 'ready';
      onStatus?.('ready', '手部模型已就绪');
      return;
    }
    this.status = 'loading';
    onStatus?.('loading', '载入手部模型');

    try {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);
      const detector = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      if (lifecycle !== this.lifecycle) { detector.close(); return; }
      this.detector = detector;

      this.status = 'ready';
      onStatus?.('ready', '手部模型已就绪');
    } catch (error) {
      const denied = error instanceof DOMException && ['NotAllowedError', 'PermissionDeniedError'].includes(error.name);
      this.status = denied ? 'denied' : 'error';
      onStatus?.(this.status, denied ? '摄像头权限被拒绝' : '模型或摄像头初始化失败');
      throw error;
    }
  }

  setVideoSource(video: HTMLVideoElement) {
    this.video = video;
    this.lastVideoTime = -1;
    this.lastFrame = null;
  }

  getVideoInfo() {
    return { width: this.video.videoWidth, height: this.video.videoHeight };
  }

  detect(timestamp: number): TrackingFrame {
    if (!this.detector || this.status !== 'ready' || this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return { hands: [], timestamp, fps: this.measuredFps };
    }

    if (this.video.currentTime === this.lastVideoTime) {
      // A stopped video must eventually become unavailable, never an indefinitely held hand.
      if (this.lastFrame && timestamp - this.lastFrame.timestamp > 250) {
        return { hands: [], timestamp: this.lastFrame.timestamp + 250, fps: 0 };
      }
      return this.lastFrame ?? { hands: [], timestamp, fps: this.measuredFps };
    }

    this.lastVideoTime = this.video.currentTime;
    let result;
    try { result = this.detector.detectForVideo(this.video, timestamp) as any; }
    catch (error) {
      this.status = 'error';
      this.lastFrame = null;
      console.warn('Hand tracking stopped after an inference error', error);
      return { hands: [], timestamp, fps: 0 };
    }
    const handedness = result.handedness ?? result.handednesses ?? [];
    const hands: TrackedHand[] = (result.landmarks ?? []).map((landmarks: any[], index: number) => ({
      landmarks: landmarks.map((point) => ({ x: point.x, y: point.y, z: point.z, visibility: point.visibility })),
      handedness: handedness[index]?.[0]?.categoryName ?? handedness[index]?.[0]?.displayName ?? 'Unknown',
      confidence: handedness[index]?.[0]?.score ?? 0.8,
    })).filter((hand: TrackedHand) => validHandLandmarks(hand.landmarks));

    this.sampleCount += 1;
    const elapsed = timestamp - this.sampleWindowStart;
    if (elapsed >= 500) {
      this.measuredFps = Math.round((this.sampleCount * 1000) / elapsed);
      this.sampleCount = 0;
      this.sampleWindowStart = timestamp;
    }

    this.lastFrame = { hands, timestamp, fps: this.measuredFps };
    return this.lastFrame;
  }

  dispose() {
    this.lifecycle += 1;
    this.detector?.close();
    this.detector = null;
    this.lastFrame = null;
    this.status = 'idle';
  }
}
