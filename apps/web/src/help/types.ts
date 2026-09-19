export type OpaleSourceId = 'YBALAC' | 'YBALAF' | 'EBLC' | 'YFDR';

export type OpaleGuideStep = {
  n: string;
  title: string;
  description: string;
  image?: string;
};

export type OpaleSourceHelp = {
  id: OpaleSourceId;
  label: string;
  format: string;
  variant?: string;
  tutorialAvailable: boolean;
  steps: OpaleGuideStep[];
  beforeImport?: string;
};

export type ViewHelpSpec = {
  purpose: string;
  sources: Array<OpaleSourceId | { name: string; format: string; note?: string }>;
  notes?: string[];
};
