type FrameSource = {
  readyState: number;
  currentTime: number;
  srcObject: unknown;
};
type UploadTarget = { needsUpdate: boolean };

/** Detached decoders may not deliver rVFC callbacks; the canonical render clock still uploads real frames. */
export class VideoFrameUpload {
  private first = true;
  private time = Number.NaN;
  private source: unknown;

  update(video: FrameSource, texture: UploadTarget): boolean {
    if (video.readyState < 2 || !Number.isFinite(video.currentTime)) {
      this.first = true;
      return false;
    }
    if (
      !this.first &&
      video.currentTime === this.time &&
      video.srcObject === this.source
    )
      return false;
    texture.needsUpdate = true;
    this.first = false;
    this.time = video.currentTime;
    this.source = video.srcObject;
    return true;
  }
}
