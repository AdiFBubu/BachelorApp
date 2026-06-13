export type InferenceModel = 'ann' | 'csnn';

export const inferenceModelLabels: Record<InferenceModel, string> = {
  ann: 'ANN',
  csnn: 'CSNN',
};

export const inferenceModelToBackend: Record<InferenceModel, 'python' | 'cpp'> = {
  ann: 'python',
  csnn: 'cpp',
};
