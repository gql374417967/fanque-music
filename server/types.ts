export type WorkflowInput = {
  title: string;
  artist: string;
  theme: string;
  genre: string;
  mood: string;
  duration: number;
  referenceAudioPath?: string;
  publishMode: 'draft' | 'publish' | 'package';
};

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export type WorkflowStep = {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type WorkflowRun = {
  id: string;
  input: WorkflowInput;
  status: 'running' | 'done' | 'failed';
  createdAt: string;
  updatedAt: string;
  steps: WorkflowStep[];
  lyrics?: string;
  audioPath?: string;
  coverPath?: string;
  packagePath?: string;
  publishResult?: unknown;
  error?: string;
};

export type PublicRun = Omit<WorkflowRun, 'audioPath' | 'coverPath' | 'packagePath'> & {
  audioUrl?: string;
  coverUrl?: string;
  packageUrl?: string;
};
