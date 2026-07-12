// AudioWorklet processor: accumulates 128-sample render quanta into fixed hops
// and posts each hop to the main thread. No analysis happens on the audio thread.
class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = (options && options.processorOptions) || {};
    this.hopSize = opts.hopSize || 480;
    this.buf = new Float32Array(this.hopSize);
    this.fill = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    let i = 0;
    while (i < ch.length) {
      const n = Math.min(ch.length - i, this.hopSize - this.fill);
      this.buf.set(ch.subarray(i, i + n), this.fill);
      this.fill += n;
      i += n;
      if (this.fill === this.hopSize) {
        const out = this.buf.slice();
        this.port.postMessage({ t: currentTime, samples: out }, [out.buffer]);
        this.fill = 0;
      }
    }
    return true;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
