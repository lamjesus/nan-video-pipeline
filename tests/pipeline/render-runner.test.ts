import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';

// Mock child_process BEFORE importing the module under test
vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

// Mock fs — pure mocks, no delegation to real fs
vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

// Mock fs/promises — pure mocks, no delegation to real fs
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  mkdir: vi.fn(),
  unlink: vi.fn(),
}));

import { checkRenderDeps, runRender, muxAudio } from '../../src/pipeline/render-runner.ts';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, mkdir, unlink } from 'node:fs/promises';

const mockExec = vi.mocked(execFile);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFile = vi.mocked(readFile);
const mockMkdir = vi.mocked(mkdir);
const mockUnlink = vi.mocked(unlink);

const CWD = process.cwd();

describe('checkRenderDeps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { hyperframes: true, ffmpeg: true } when both commands succeed', async () => {
    mockExec.mockImplementation((_cmd, _args, cb) => {
      cb!(null, { stdout: 'v1.0.0', stderr: '' });
      return {} as any;
    });

    const result = await checkRenderDeps();
    expect(result).toEqual({ hyperframes: true, ffmpeg: true });
    expect(mockExec).toHaveBeenCalledTimes(2);
  });

  it('returns { hyperframes: false, ffmpeg: false } when both commands fail', async () => {
    mockExec.mockImplementation((_cmd, _args, cb) => {
      cb!(new Error('command not found'), { stdout: '', stderr: '' });
      return {} as any;
    });

    const result = await checkRenderDeps();
    expect(result).toEqual({ hyperframes: false, ffmpeg: false });
  });

  it('returns { hyperframes: true, ffmpeg: false } when only ffmpeg fails', async () => {
    let callCount = 0;
    mockExec.mockImplementation((cmd, _args, cb) => {
      callCount++;
      if (callCount === 1) {
        cb!(null, { stdout: 'v1.0.0', stderr: '' });
      } else {
        cb!(new Error('not found'), { stdout: '', stderr: '' });
      }
      return {} as any;
    });

    const result = await checkRenderDeps();
    expect(result).toEqual({ hyperframes: true, ffmpeg: false });
  });
});

describe('runRender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ERROR/WHY/FIX when index.html does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(runRender('caso-test')).rejects.toThrow(/ERROR/);
    await expect(runRender('caso-test')).rejects.toThrow(/WHY/);
    await expect(runRender('caso-test')).rejects.toThrow(/FIX/);
  });

  it('calls hyperframes render with correct arguments when workspace exists', async () => {
    mockExistsSync.mockReturnValue(true);
    mockExec.mockImplementation((_cmd, _args, cb) => {
      cb!(null, { stdout: '', stderr: '' });
      return {} as any;
    });

    await runRender('caso-test');

    expect(mockExec).toHaveBeenCalledWith(
      'npx',
      [
        'hyperframes',
        'render',
        resolve(CWD, 'renders', 'caso-test'),
        '--output',
        resolve(CWD, 'renders', 'caso-test', 'video-silent.mp4'),
        '--workers',
        '1',
        '--low-memory-mode',
      ],
      expect.any(Function),
    );
  });

  it('throws ERROR when hyperframes command fails', async () => {
    mockExistsSync.mockReturnValue(true);
    mockExec.mockImplementation((_cmd, _args, cb) => {
      cb!(new Error('hyperframes crashed'), { stdout: '', stderr: '' });
      return {} as any;
    });

    await expect(runRender('caso-test')).rejects.toThrow(/ERROR.*hyperframes/i);
  });
});

describe('muxAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ERROR when manifest.json does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(muxAudio('caso-test')).rejects.toThrow(/ERROR/);
  });

  it('throws ERROR when video-silent.mp4 does not exist', async () => {
    // manifest exists, but video-silent.mp4 does not
    mockExistsSync.mockImplementation((p: string) => {
      if (typeof p === 'string' && p.endsWith('manifest.json')) return true;
      return false;
    });
    mockReadFile.mockResolvedValue(JSON.stringify({
      audio: { path: 'audio/caso-test.mp3' },
    }));

    await expect(muxAudio('caso-test')).rejects.toThrow(/ERROR.*video/i);
  });

  it('runs ffmpeg with correct args: audio first, video second, -shortest', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({
      audio: { path: 'audio/caso-test.mp3' },
    }));
    mockMkdir.mockResolvedValue(undefined);

    let ffmpegArgs: string[] = [];
    mockExec.mockImplementation((cmd, args, cb) => {
      if (cmd === 'ffmpeg') {
        ffmpegArgs = args as string[];
      }
      cb!(null, { stdout: '', stderr: '' });
      return {} as any;
    });

    await muxAudio('caso-test');

    // Audio file is input 0, video is input 1
    expect(ffmpegArgs[0]).toBe('-i');
    expect(ffmpegArgs[1]).toContain('audio/caso-test.mp3');
    expect(ffmpegArgs[2]).toBe('-i');
    expect(ffmpegArgs[3]).toContain('video-silent.mp4');

    // Video mapping: input 1 (silent video)
    expect(ffmpegArgs).toContain('-map');
    expect(ffmpegArgs).toContain('1:v:0');
    // Audio mapping: input 0 (audio file)
    expect(ffmpegArgs).toContain('0:a:0');

    // -shortest flag
    expect(ffmpegArgs).toContain('-shortest');

    // -y flag (overwrite)
    expect(ffmpegArgs).toContain('-y');
  });

  it('creates assets/output/ directory before muxing', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({
      audio: { path: 'audio/caso-test.mp3' },
    }));
    mockExec.mockImplementation((_cmd, _args, cb) => {
      cb!(null, { stdout: '', stderr: '' });
      return {} as any;
    });

    await muxAudio('caso-test');

    expect(mockMkdir).toHaveBeenCalledWith(
      resolve(CWD, 'assets', 'output'),
      { recursive: true },
    );
  });

  it('cleans up video-silent.mp4 after successful mux', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({
      audio: { path: 'audio/caso-test.mp3' },
    }));
    mockExec.mockImplementation((_cmd, _args, cb) => {
      cb!(null, { stdout: '', stderr: '' });
      return {} as any;
    });

    await muxAudio('caso-test');

    expect(mockUnlink).toHaveBeenCalledWith(
      resolve(CWD, 'renders', 'caso-test', 'video-silent.mp4'),
    );
  });

  it('outputs to assets/output/<slug>.mp4', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(JSON.stringify({
      audio: { path: 'audio/caso-ejemplo.mp3' },
    }));
    mockExec.mockImplementation((_cmd, _args, cb) => {
      cb!(null, { stdout: '', stderr: '' });
      return {} as any;
    });

    await muxAudio('caso-ejemplo');

    // Last arg to ffmpeg is the output path
    const call = mockExec.mock.calls.find((c) => c[0] === 'ffmpeg');
    expect(call).toBeDefined();
    const args = call![1] as string[];
    const outputPath = args[args.length - 1];
    expect(outputPath).toBe(resolve(CWD, 'assets', 'output', 'caso-ejemplo.mp4'));
  });
});
