/** Relationship origin (plan §3.2). AI_SUGGESTED is never repository truth. */
export type Origin = 'EXPLICIT' | 'INFERRED' | 'MANUAL' | 'AI_SUGGESTED';

export type EdgeType =
  | 'uses' | 'creates' | 'inherits' | 'implements' | 'runs' | 'includes'
  | 'tests' | 'implements-req' | 'enforces' | 'db-read' | 'db-write' | 'mirrors'
  | 'maps-step-req' | 'maps-step-file' | 'maps-step-rule' | 'maps-step-table';

export interface Evidence {
  /** Human-readable heuristic that produced the relationship. */
  reason: string;
  /** Stable entity refs (see refs.ts) or file paths supporting it. */
  refs?: string[];
  /** Position among a step's matches (best first / document order); used to keep prototype ordering. */
  rank?: number;
}

export interface Edge {
  from: string;
  to: string;
  type: EdgeType;
  origin: Origin;
  /** 1 for EXPLICIT/MANUAL; 0..1 for INFERRED. */
  confidence: number;
  evidence?: Evidence;
}

export type FileKind = 'class' | 'procedure' | 'window' | 'include' | 'schema' | 'doc' | 'data' | 'other';

export interface SourceFile {
  path: string;
  /** Decoded text (UTF-8 or Windows-1252 fallback, LF newlines). */
  text: string;
  blobSha?: string;
}

export interface CommitInput {
  sha: string;
  author: string;
  date: string;
  subject: string;
  parents: string[];
  branch?: string;
  files: { path: string; additions: number; deletions: number }[];
}

export interface FileNode {
  path: string;
  kind: FileKind;
  layer?: string;
  loc: number;
  header?: string;
  isTest: boolean;
}

export interface SymbolNode {
  fqn: string;
  name: string;
  file: string;
  classKind: 'class' | 'abstract' | 'interface' | 'test';
  inherits?: string;
  implements: string[];
  methods: string[];
  tests: string[];
}

export interface RequirementNode {
  code: string;
  kind: 'requirement' | 'rule';
  title: string;
  body: string;
  docPath: string;
  /** Line index within its document (prototype `order`), used for index alignment with process steps. */
  order: number;
}

export interface RuleCodeNode {
  code: string;
  impl: string;
  trace: string;
}

export interface TableNode {
  name: string;
  type: 'table' | 'sequence';
  addedIn: string;
  /** True while only known from ADD FIELD in a delta (its table is defined elsewhere). */
  stub?: boolean;
  fields: { name: string; type: string; addedIn: string }[];
}

export interface ProcessStepNode {
  n: number;
  name: string;
  /** Explicit requirement (process.json / Add process form). */
  requirement?: string;
  /** Explicit files/rules from process.json (origin EXPLICIT). */
  files?: string[];
  rules?: string[];
}

export interface ProcessNode {
  name: string;
  origin: 'DETECTED' | 'EXPLICIT' | 'MANUAL';
  description?: string;
  docPath?: string;
  steps: ProcessStepNode[];
}

export interface FileMetrics {
  path: string;
  loc: number;
  churn: number;
  incidents: number;
  fanIn: number;
  directTests: number;
}

/** Output of parseSource(); the stable contract between ingest and everything else. */
export interface GraphInput {
  files: FileNode[];
  symbols: SymbolNode[];
  edges: Edge[];
  tables: TableNode[];
  requirements: RequirementNode[];
  ruleCodes: RuleCodeNode[];
  processes: ProcessNode[];
  metrics: FileMetrics[];
  warnings: string[];
}

export interface ParseOptions {
  /** Requirement/rule code prefixes to recognise in code, e.g. ['BR', 'NB']. Auto-derived if omitted. */
  knownCodes?: string[];
  /** Commits touching more files than this are ignored for churn (plan §10.8). */
  churnMaxFiles?: number;
  /** Maximum step->file matches to keep (plan §10.6). */
  maxStepFiles?: number;
}

export type Role = 'ADMIN' | 'MAINTAINER' | 'CONTRIBUTOR' | 'VIEWER';
export type Audience = 'BUSINESS_ANALYST' | 'DEVELOPER' | 'QA' | 'ARCHITECT';
