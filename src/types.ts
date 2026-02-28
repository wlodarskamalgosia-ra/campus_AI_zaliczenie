export enum Severity {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export interface TimeEntry {
  data: string;
  nazwisko: string;
  imie: string;
  przelozony: string;
  projekt: string;
  zadanie: string;
  opis: string;
  godziny: number;
  nieobecnosc: string;
  rawRow: any;
}

export interface Anomaly {
  id: string;
  osoba: string;
  data: string;
  projekt: string;
  zadanie?: string;
  godziny: number;
  kategoria: string;
  severity: Severity;
  opis: string;
  wpisOpis: string;
  rawRow?: any;
}

export interface AnalysisResult {
  totalHours: number;
  totalAnomalies: number;
  anomalyHours: number;
  riskScore: number;
  anomalies: Anomaly[];
  personStats: Record<string, PersonStat>;
  projectStats: Record<string, ProjectStat>;
  taskStats: TaskStat[];
  topFindings: Anomaly[];
  recommendations: string[];
  topPeopleByCount: { osoba: string; count: number }[];
  topPeopleByWeight: { osoba: string; score: number }[];
}

export interface TaskStat {
  projekt: string;
  zadanie: string;
  typ: string;
  godziny: number;
  osobyCount: number;
  anomalieCount: number;
}

export interface PersonStat {
  osoba: string;
  przelozony: string;
  godziny: number;
  wymagane: number;
  anomalieCount: number;
  maxSeverity: Severity | null;
  anomalie: Anomaly[];
}

export interface ProjectStat {
  projekt: string;
  typ: "Kliencki" | "Wewnętrzny" | "Nieznany";
  godziny: number;
  osoby: Set<string>;
  anomalieCount: number;
}

export const DEFAULT_BILLABLE_PROJECTS = [
  "Bay Club - Team Leasing",
  "Bay Club - Website Webflow (SOA)",
  "CMplus 2024",
  "EoS Marketing Team Leasing",
  "Eos Team Leasing",
  "Exerfly",
  "Pure Gym",
  "PureGym - Web Enhancements",
  "Sport Clubs Company",
  "Xtreme Fitness 2.0",
  "Xtreme Fitness support & maintenance",
];

export const DEFAULT_INTERNAL_PROJECTS = [
  "Qodeca - Marketing",
  "Qodeca - Core",
  "Qodeca - HR&Operacje",
  "Qodeca - Internal Activities",
  "Qodeca - Projekt wewnetrzny - Miromate",
  "Qodeca - Website",
];
