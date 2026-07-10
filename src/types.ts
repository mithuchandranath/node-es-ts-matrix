export type Proposal = { title: string; url: string };

export type MatrixStatus =
  | "current"
  | "active-lts"
  | "maintenance"
  | "eol"
  | "future";

export type MatrixRow = {
  nodeMajor: number;
  nodeCodename?: string;
  status: MatrixStatus;
  ltsStart?: string;
  maintenanceStart?: string;
  eol: string;
  target?: string;
  lib?: string[];
  module?: string;
  minTsVersion: string;
  minTsVersionSource: "typescript-lib" | "unknown";
  minTsReleaseNotesUrl?: string;
  targetProposals?: Proposal[];
  nativeTsStripping: boolean;
  tsconfigDisplay?: string;
};

export type NextReleases = {
  typescript: {
    latest?: string;
    next?: string;
    beta?: string;
    rc?: string;
  };
  node?: {
    major: number;
    codename?: string;
    eol: string;
    ltsStart?: string;
  };
};

export type MatrixData = {
  generatedAt: string;
  sources: {
    tsconfigBases: string;
    nodeSchedule: string;
    typescriptRegistry: string;
    typescriptRepo: string;
    tc39Proposals: string;
  };
  nextReleases: NextReleases;
  rows: MatrixRow[];
};
