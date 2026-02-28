/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { 
  BarChart3, 
  AlertTriangle, 
  Clock, 
  Users, 
  Briefcase, 
  ChevronDown, 
  ChevronUp, 
  Trash2, 
  Download, 
  Search,
  Filter,
  Bell,
  Plus,
  X,
  FileText,
  Table as TableIcon,
  Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DEFAULT_BILLABLE_PROJECTS, 
  DEFAULT_INTERNAL_PROJECTS, 
  Severity, 
  TimeEntry, 
  AnalysisResult,
  Anomaly,
  PersonStat,
  ProjectStat
} from './types';
import { analyzeTimeEntries } from './analysis';
import { cn } from './lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

export default function App() {
  const [csvData, setCsvData] = useState('');
  const [billableProjects] = useState(DEFAULT_BILLABLE_PROJECTS.join(', '));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'ALL'>('ALL');
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const [dismissedAnomalies, setDismissedAnomalies] = useState<Set<string>>(new Set());
  const [selectedAnomalies, setSelectedAnomalies] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [hoveredAnomaly, setHoveredAnomaly] = useState<Anomaly | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [activeTab, setActiveTab] = useState<'summary' | 'tasks' | 'people' | 'anomalies'>('summary');
  const [parsedEntries, setParsedEntries] = useState<TimeEntry[]>([]);
  const [uniqueProjects, setUniqueProjects] = useState<string[]>([]);
  const [selectedInternalProjects, setSelectedInternalProjects] = useState<Set<string>>(new Set<string>());
  const [isSelectingProjects, setIsSelectingProjects] = useState(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY });
  };

  const handleUpload = () => {
    if (!csvData.trim()) return;
    
    setIsAnalyzing(true);
    
    setTimeout(() => {
      Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const allEntries: TimeEntry[] = results.data.map((row: any) => ({
            data: row['Data'] || '',
            nazwisko: row['Nazwisko'] || '',
            imie: row['Imie'] || '',
            przelozony: row['Przelozony'] || '',
            projekt: row['Projekt'] || '',
            zadanie: row['Zadanie'] || '',
            opis: row['Opis'] || '',
            godziny: parseFloat(row['Godziny']) || 0,
            nieobecnosc: row['Nieobecnosc'] || '',
            rawRow: row
          }));

          const projects = Array.from(new Set(allEntries.map(e => e.projekt))).sort();
          setUniqueProjects(projects);
          setParsedEntries(allEntries);
          
          // Pre-select projects that look internal
          const initialInternal = new Set<string>();
          projects.forEach(p => {
            if (p.toLowerCase().includes("qodeca") || 
                p.toLowerCase().includes("internal") ||
                DEFAULT_INTERNAL_PROJECTS.some(dp => p.toLowerCase().includes(dp.toLowerCase()))) {
              initialInternal.add(p);
            }
          });
          setSelectedInternalProjects(initialInternal);
          
          setIsSelectingProjects(true);
          setIsAnalyzing(false);
        },
        error: (err) => {
          console.error(err);
          setIsAnalyzing(false);
          alert('Błąd podczas parsowania CSV.');
        }
      });
    }, 800);
  };

  const handleStartAnalysis = () => {
    setIsAnalyzing(true);
    setDismissedAnomalies(new Set());
    setSelectedAnomalies(new Set());

    setTimeout(() => {
      const internalList = Array.from<string>(selectedInternalProjects);
      
      // Filter for selected internal projects
      const qodecaEntries = parsedEntries.filter(e => 
        selectedInternalProjects.has(e.projekt)
      );

      const analysis = analyzeTimeEntries(
        qodecaEntries,
        152, // Default required hours
        billableProjects.split(',').map(p => p.trim()),
        internalList
      );
      
      setResult(analysis);
      setIsSelectingProjects(false);
      setIsAnalyzing(false);
      setActiveTab('summary');
    }, 800);
  };

  const handleClear = () => {
    setCsvData('');
    setResult(null);
    setParsedEntries([]);
    setUniqueProjects([]);
    setSelectedInternalProjects(new Set());
    setIsSelectingProjects(false);
    setExpandedPerson(null);
    setDismissedAnomalies(new Set());
    setSelectedAnomalies(new Set());
  };

  const handleDismiss = (id: string) => {
    setDismissedAnomalies(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setSelectedAnomalies(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedAnomalies(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedAnomalies.size === filteredAnomalies.length) {
      setSelectedAnomalies(new Set());
    } else {
      setSelectedAnomalies(new Set(filteredAnomalies.map(a => a.id)));
    }
  };

  const handleSendEmail = () => {
    if (!result || selectedAnomalies.size === 0) return;
    const selected = result.anomalies.filter(a => selectedAnomalies.has(a.id));
    const subject = encodeURIComponent(`TimeSentinel Report - ${new Date().toLocaleDateString()}`);
    const body = encodeURIComponent(`Selected Anomalies:\n\n${selected.map(a => `- ${a.osoba} (${a.data}): ${a.kategoria} - ${a.opis}`).join('\n')}`);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const exportToPDF = () => {
    if (!result) return;
    const doc = new jsPDF();
    doc.text("TimeSentinel Analysis Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22);
    
    autoTable(doc, {
      startY: 30,
      head: [['Osoba', 'Data', 'Kategoria', 'Severity', 'Opis']],
      body: result.anomalies.filter(a => !dismissedAnomalies.has(a.id)).map(a => [a.osoba, a.data, a.kategoria, a.severity, a.opis]),
    });
    
    doc.save("timesentinel_report.pdf");
  };

  const exportToXLS = () => {
    if (!result) return;
    const ws = XLSX.utils.json_to_sheet(result.anomalies.filter(a => !dismissedAnomalies.has(a.id)).map(a => ({
      Osoba: a.osoba,
      Data: a.data,
      Projekt: a.projekt,
      Godziny: a.godziny,
      Kategoria: a.kategoria,
      Severity: a.severity,
      Opis: a.opis
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Anomalies");
    XLSX.writeFile(wb, "timesentinel_report.xlsx");
  };

  const handleSort = (key: string) => {
    setSortConfig(prev => {
      if (prev?.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const sortData = <T extends any>(data: T[], key: string | null, direction: 'asc' | 'desc' | undefined): T[] => {
    if (!key || !direction) return data;
    return [...data].sort((a: any, b: any) => {
      const aValue = a[key];
      const bValue = b[key];
      if (aValue === undefined || bValue === undefined) return 0;
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  const filteredAnomalies = useMemo(() => {
    if (!result) return [];
    let data = result.anomalies.filter(a => {
      if (dismissedAnomalies.has(a.id)) return false;
      if (filterSeverity !== 'ALL' && a.severity !== filterSeverity) return false;
      if (selectedCategories.size > 0 && !selectedCategories.has(a.kategoria)) return false;
      
      // Column filters for anomalies tab
      if (columnFilters.anom_osoba && !a.osoba.toLowerCase().includes(columnFilters.anom_osoba.toLowerCase())) return false;
      if (columnFilters.anom_data && !a.data.toLowerCase().includes(columnFilters.anom_data.toLowerCase())) return false;
      if (columnFilters.anom_kategoria && !a.kategoria.toLowerCase().includes(columnFilters.anom_kategoria.toLowerCase())) return false;
      
      if (searchQuery && !a.osoba.toLowerCase().includes(searchQuery.toLowerCase()) && !a.kategoria.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    if (activeTab === 'anomalies' && sortConfig) {
      data = sortData(data, sortConfig.key, sortConfig.direction);
    }
    return data;
  }, [result, filterSeverity, dismissedAnomalies, searchQuery, selectedCategories, columnFilters, sortConfig, activeTab]);

  const activeReport = useMemo(() => {
    if (!result) return null;
    
    const severityWeights = {
      [Severity.CRITICAL]: 10,
      [Severity.HIGH]: 5,
      [Severity.MEDIUM]: 2,
      [Severity.LOW]: 1
    };

    const totalWeight = filteredAnomalies.reduce((sum, a) => sum + severityWeights[a.severity], 0);
    const riskScore = Math.min(100, Math.round((totalWeight / (result.totalHours / 8 || 1)) * 5));

    return {
      totalAnomalies: filteredAnomalies.length,
      anomalyHours: filteredAnomalies.reduce((sum, a) => sum + a.godziny, 0),
      riskScore: riskScore,
      topFindings: [...filteredAnomalies]
        .sort((a, b) => severityWeights[b.severity] - severityWeights[a.severity])
        .slice(0, 5)
    };
  }, [result, filteredAnomalies]);

  const filteredTaskStats = useMemo(() => {
    if (!result) return [];
    
    let data = result.taskStats.map(s => {
      // Calculate dynamic anomaly count based on filtered anomalies
      const count = filteredAnomalies.filter(a => a.projekt === s.projekt && a.zadanie === s.zadanie).length;
      return { ...s, anomalieCount: count };
    });

    // If category filter is active, only show tasks with anomalies
    if (selectedCategories.size > 0) {
      data = data.filter(s => s.anomalieCount > 0);
    }

    data = data.filter(s => {
      if (columnFilters.task_projekt && !s.projekt.toLowerCase().includes(columnFilters.task_projekt.toLowerCase())) return false;
      if (columnFilters.task_zadanie && !s.zadanie.toLowerCase().includes(columnFilters.task_zadanie.toLowerCase())) return false;
      if (columnFilters.task_typ && !s.typ.toLowerCase().includes(columnFilters.task_typ.toLowerCase())) return false;
      return true;
    });

    if (activeTab === 'tasks' && sortConfig) {
      data = sortData(data, sortConfig.key, sortConfig.direction);
    }
    return data;
  }, [result, filteredAnomalies, selectedCategories, columnFilters, sortConfig, activeTab]);

  const filteredPersonStats = useMemo(() => {
    if (!result) return [];
    
    let data = (Object.values(result.personStats) as PersonStat[]).map(p => {
      // Calculate dynamic anomaly count and list based on filtered anomalies
      const personAnomalies = filteredAnomalies.filter(a => a.osoba === p.osoba);
      const order = { [Severity.CRITICAL]: 4, [Severity.HIGH]: 3, [Severity.MEDIUM]: 2, [Severity.LOW]: 1 };
      let maxSev: Severity | null = null;
      personAnomalies.forEach(a => {
        if (!maxSev || order[a.severity] > order[maxSev]) maxSev = a.severity;
      });

      return {
        ...p,
        anomalieCount: personAnomalies.length,
        anomalie: personAnomalies,
        maxSeverity: maxSev
      };
    });

    // If category filter is active, only show people with anomalies
    if (selectedCategories.size > 0) {
      data = data.filter(p => p.anomalieCount > 0);
    }

    data = data.filter(p => {
      if (columnFilters.pers_osoba && !p.osoba.toLowerCase().includes(columnFilters.pers_osoba.toLowerCase())) return false;
      if (columnFilters.pers_przelozony && !p.przelozony.toLowerCase().includes(columnFilters.pers_przelozony.toLowerCase())) return false;
      return true;
    });

    if (activeTab === 'people' && sortConfig) {
      data = sortData(data, sortConfig.key, sortConfig.direction);
    }
    return data;
  }, [result, filteredAnomalies, selectedCategories, columnFilters, sortConfig, activeTab]);

  const allCategories = useMemo(() => {
    if (!result) return [];
    const cats = new Set(result.anomalies.map(a => a.kategoria));
    return Array.from(cats).sort();
  }, [result]);

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const updateColumnFilter = (key: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }));
  };

  const getSeverityColor = (severity: Severity) => {
    switch (severity) {
      case Severity.CRITICAL: return 'text-red-600 bg-red-50 border-red-100';
      case Severity.HIGH: return 'text-orange-600 bg-orange-50 border-orange-100';
      case Severity.MEDIUM: return 'text-yellow-700 bg-yellow-50 border-yellow-100';
      case Severity.LOW: return 'text-blue-600 bg-blue-50 border-blue-100';
    }
  };

  return (
    <div className="min-h-screen bg-[#fcfcfc] text-[#1a1a1a] font-sans">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-[1440px] mx-auto px-6 h-[72px] flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#e2f331] rounded-lg flex items-center justify-center shadow-sm">
                <div className="w-4 h-4 bg-black rounded-sm rotate-45" />
              </div>
              <div className="flex items-baseline gap-0.5">
                <span className="text-xl font-bold tracking-tight">qodeca</span>
                <span className="text-xl font-bold text-[#e2f331]">_internal</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-400 hover:text-black transition-colors">
              <Bell className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 py-10">
        {!result && !isSelectingProjects ? (
          <div className="max-w-4xl mx-auto">
            <div className="mb-10">
              <h1 className="text-4xl font-bold mb-2">Analiza Anomalii</h1>
              <p className="text-gray-500 text-lg">Wgraj ewidencję czasu pracy, aby wykryć nieprawidłowości w projektach Qodeca.</p>
            </div>
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8 space-y-8">
              <div className="space-y-4">
                <label className="text-sm font-bold uppercase tracking-wider text-gray-400">Dane CSV</label>
                <textarea
                  value={csvData}
                  onChange={(e) => setCsvData(e.target.value)}
                  placeholder="Data, Nazwisko, Imie, Przelozony, Projekt, Zadanie, Opis, Godziny, Nieobecnosc"
                  className="w-full h-64 bg-[#f8f9fa] border border-gray-200 rounded-xl p-6 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#e2f331] transition-all resize-none"
                />
              </div>
              <div className="flex items-center justify-end pt-4">
                <button onClick={handleUpload} disabled={isAnalyzing || !csvData.trim()} className={cn("px-8 py-3 rounded-xl font-bold flex items-center gap-3 transition-all shadow-lg", isAnalyzing || !csvData.trim() ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-[#e2f331] hover:bg-[#d4e52a] text-black active:scale-[0.98]")}>
                  {isAnalyzing ? <div className="w-5 h-5 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : <Plus className="w-5 h-5" />}
                  Wgraj i wybierz projekty
                </button>
              </div>
            </div>
          </div>
        ) : isSelectingProjects ? (
          <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-10">
              <h1 className="text-4xl font-bold mb-2">Wybierz Projekty Wewnętrzne</h1>
              <p className="text-gray-500 text-lg">Zaznacz projekty, które powinny zostać objęte analizą jako projekty Qodeca.</p>
            </div>
            
            <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto p-2">
                {uniqueProjects.map(project => (
                  <label key={project} className={cn(
                    "flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all",
                    selectedInternalProjects.has(project) 
                      ? "bg-[#e2f331]/10 border-[#e2f331] shadow-sm" 
                      : "bg-gray-50 border-gray-100 hover:border-gray-200"
                  )}>
                    <input 
                      type="checkbox" 
                      checked={selectedInternalProjects.has(project)}
                      onChange={() => {
                        const next = new Set(selectedInternalProjects);
                        if (next.has(project)) next.delete(project);
                        else next.add(project);
                        setSelectedInternalProjects(next);
                      }}
                      className="w-4 h-4 accent-black"
                    />
                    <span className="text-sm font-medium truncate" title={project}>{project}</span>
                  </label>
                ))}
              </div>
              
              <div className="flex items-center justify-between pt-6 border-t border-gray-100">
                <button onClick={handleClear} className="text-sm font-bold text-gray-400 hover:text-red-500 transition-colors">
                  Anuluj i wyczyść
                </button>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500 font-medium">
                    Wybrano: <span className="font-bold text-black">{selectedInternalProjects.size}</span> projektów
                  </span>
                  <button 
                    onClick={handleStartAnalysis} 
                    disabled={isAnalyzing || selectedInternalProjects.size === 0}
                    className={cn(
                      "px-8 py-3 rounded-xl font-bold flex items-center gap-3 transition-all shadow-lg",
                      isAnalyzing || selectedInternalProjects.size === 0 ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "bg-black text-white hover:bg-gray-800 active:scale-[0.98]"
                    )}
                  >
                    {isAnalyzing ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <BarChart3 className="w-5 h-5" />}
                    Rozpocznij Analizę
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div>
                <h1 className="text-[32px] font-bold mb-1">Panel Analizy</h1>
                <p className="text-gray-500">Kompleksowy przegląd anomalii w projektach Qodeca</p>
              </div>
              <div className="flex items-center gap-3">
                {selectedAnomalies.size > 0 && (
                  <button onClick={handleSendEmail} className="px-4 py-2 rounded-xl bg-[#e2f331] text-black font-bold text-sm hover:bg-[#d4e52a] transition-colors flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Wyślij ({selectedAnomalies.size})
                  </button>
                )}
                <button onClick={exportToPDF} className="px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm hover:bg-gray-50 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  PDF
                </button>
                <button onClick={exportToXLS} className="px-4 py-2 rounded-xl border border-gray-200 font-bold text-sm hover:bg-gray-50 flex items-center gap-2">
                  <TableIcon className="w-4 h-4" />
                  XLS
                </button>
                <button onClick={handleClear} className="px-4 py-2 rounded-xl bg-black text-white font-bold text-sm hover:bg-gray-800 flex items-center gap-2">
                  <Trash2 className="w-4 h-4" />
                  Nowa analiza
                </button>
              </div>
            </div>

            {/* Global Category Filter */}
            <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 flex items-center gap-2">
                  <Filter className="w-4 h-4" />
                  Filtruj Raport po Kategoriach
                </h3>
                {selectedCategories.size > 0 && (
                  <button onClick={() => setSelectedCategories(new Set())} className="text-xs font-bold text-red-500 hover:underline">
                    Wyczyść wszystkie
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {allCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                      selectedCategories.has(cat)
                        ? "bg-[#e2f331] border-[#e2f331] text-black shadow-sm"
                        : "bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200"
                    )}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit">
              {[
                { id: 'summary', label: 'Podsumowanie', icon: BarChart3 },
                { id: 'tasks', label: 'Projekty', icon: Briefcase },
                { id: 'people', label: 'Osoby', icon: Users },
                { id: 'anomalies', label: 'Wszystkie Anomalie', icon: AlertTriangle },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all",
                    activeTab === tab.id ? "bg-white text-black shadow-sm" : "text-gray-500 hover:text-black"
                  )}
                >
                  <tab.icon className="w-4 h-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              {activeTab === 'summary' && (
                <motion.div key="summary" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
                  {/* Executive Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {[
                      { label: 'Łączne Godziny', value: `${result.totalHours.toFixed(2)}h`, icon: Clock, color: 'text-blue-600' },
                      { label: 'Liczba Anomalii', value: activeReport?.totalAnomalies || 0, icon: AlertTriangle, color: 'text-orange-600' },
                      { label: 'Godziny z Błędami', value: `${(activeReport?.anomalyHours || 0).toFixed(2)}h`, icon: Clock, color: 'text-red-600' },
                      { label: 'Risk Score', value: `${activeReport?.riskScore || 0}/100`, icon: BarChart3, color: (activeReport?.riskScore || 0) > 70 ? 'text-red-600' : 'text-emerald-600' },
                    ].map((stat) => (
                      <div key={stat.label} className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm">
                        <div className="flex items-center gap-3 mb-4">
                          <div className={cn("p-2 rounded-lg bg-gray-50", stat.color)}>
                            <stat.icon className="w-5 h-5" />
                          </div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{stat.label}</p>
                        </div>
                        <p className="text-3xl font-bold">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Selected Internal Projects */}
                  {Array.from(selectedInternalProjects).length > 0 && (
                    <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
                      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                        <Briefcase className="w-5 h-5 text-[#e2f331]" />
                        Wybrane Projekty Wewnętrzne
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(selectedInternalProjects).map(p => (
                          <span key={p} className="px-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs font-medium text-gray-600">
                            {p}
                          </span>
                        ))}
                      </div>
                      <p className="mt-4 text-xs text-gray-400 italic">
                        * Powyższe projekty zostały wskazane jako wewnętrzne i stanowią podstawę analizy.
                      </p>
                    </div>
                  )}

                  {/* Top 5 Findings */}
                  <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-6">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                      Top 5 Najważniejszych Znalezisk
                    </h3>
                    <div className="space-y-4">
                      {(activeReport?.topFindings || []).map((f, i) => (
                        <div key={f.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-center gap-4">
                            <span className="text-sm font-bold text-gray-300">#{i+1}</span>
                            <div>
                              <p className="font-bold text-sm">{f.osoba}</p>
                              <p className="text-xs text-gray-500">{f.kategoria}: {f.opis}</p>
                            </div>
                          </div>
                          <span className={cn("px-2 py-1 rounded-lg text-[10px] font-bold uppercase border", getSeverityColor(f.severity))}>
                            {f.severity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'tasks' && (
                <motion.div key="tasks" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('projekt')}>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-400 uppercase">Projekt</span>
                              <ChevronDown className={cn("w-3 h-3 transition-transform", sortConfig?.key === 'projekt' && sortConfig.direction === 'desc' ? "rotate-180" : "")} />
                            </div>
                            <input type="text" placeholder="Filtruj..." value={columnFilters.task_projekt || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => updateColumnFilter('task_projekt', e.target.value)} className="text-[10px] px-2 py-1 border border-gray-200 rounded bg-white font-normal" />
                          </div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('zadanie')}>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-400 uppercase">Zadanie</span>
                              <ChevronDown className={cn("w-3 h-3 transition-transform", sortConfig?.key === 'zadanie' && sortConfig.direction === 'desc' ? "rotate-180" : "")} />
                            </div>
                            <input type="text" placeholder="Filtruj..." value={columnFilters.task_zadanie || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => updateColumnFilter('task_zadanie', e.target.value)} className="text-[10px] px-2 py-1 border border-gray-200 rounded bg-white font-normal" />
                          </div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('typ')}>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-400 uppercase">Typ</span>
                              <ChevronDown className={cn("w-3 h-3 transition-transform", sortConfig?.key === 'typ' && sortConfig.direction === 'desc' ? "rotate-180" : "")} />
                            </div>
                            <input type="text" placeholder="Filtruj..." value={columnFilters.task_typ || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => updateColumnFilter('task_typ', e.target.value)} className="text-[10px] px-2 py-1 border border-gray-200 rounded bg-white font-normal" />
                          </div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('godziny')}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-400 uppercase">Godziny</span>
                            <ChevronDown className={cn("w-3 h-3 transition-transform", sortConfig?.key === 'godziny' && sortConfig.direction === 'desc' ? "rotate-180" : "")} />
                          </div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('anomalieCount')}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-400 uppercase">Anomalie</span>
                            <ChevronDown className={cn("w-3 h-3 transition-transform", sortConfig?.key === 'anomalieCount' && sortConfig.direction === 'desc' ? "rotate-180" : "")} />
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredTaskStats.map((s, i) => (
                        <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-semibold">{s.projekt}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{s.zadanie}</td>
                          <td className="px-6 py-4 text-xs font-bold text-gray-400">{s.typ}</td>
                          <td className="px-6 py-4 text-sm font-mono">{s.godziny.toFixed(1)}h</td>
                          <td className="px-6 py-4">
                            <span className={cn("px-2 py-1 rounded-lg text-xs font-bold", s.anomalieCount > 0 ? "bg-orange-50 text-orange-600" : "bg-emerald-50 text-emerald-600")}>
                              {s.anomalieCount}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}

              {activeTab === 'people' && (
                <motion.div key="people" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('osoba')}>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-400 uppercase">Osoba</span>
                              <ChevronDown className={cn("w-3 h-3 transition-transform", sortConfig?.key === 'osoba' && sortConfig.direction === 'desc' ? "rotate-180" : "")} />
                            </div>
                            <input type="text" placeholder="Filtruj..." value={columnFilters.pers_osoba || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => updateColumnFilter('pers_osoba', e.target.value)} className="text-[10px] px-2 py-1 border border-gray-200 rounded bg-white font-normal" />
                          </div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('przelozony')}>
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-gray-400 uppercase">Przełożony</span>
                              <ChevronDown className={cn("w-3 h-3 transition-transform", sortConfig?.key === 'przelozony' && sortConfig.direction === 'desc' ? "rotate-180" : "")} />
                            </div>
                            <input type="text" placeholder="Filtruj..." value={columnFilters.pers_przelozony || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => updateColumnFilter('pers_przelozony', e.target.value)} className="text-[10px] px-2 py-1 border border-gray-200 rounded bg-white font-normal" />
                          </div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('godziny')}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-400 uppercase">Godziny</span>
                            <ChevronDown className={cn("w-3 h-3 transition-transform", sortConfig?.key === 'godziny' && sortConfig.direction === 'desc' ? "rotate-180" : "")} />
                          </div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('anomalieCount')}>
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-400 uppercase">Anomalie</span>
                            <ChevronDown className={cn("w-3 h-3 transition-transform", sortConfig?.key === 'anomalieCount' && sortConfig.direction === 'desc' ? "rotate-180" : "")} />
                          </div>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Severity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredPersonStats.map((p, i) => (
                        <React.Fragment key={i}>
                          <tr 
                            onClick={() => setExpandedPerson(expandedPerson === p.osoba ? null : p.osoba)}
                            className="hover:bg-gray-50/50 transition-colors cursor-pointer"
                          >
                            <td className="px-6 py-4 text-sm font-bold">{p.osoba}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">{p.przelozony}</td>
                            <td className="px-6 py-4 text-sm font-mono">{p.godziny.toFixed(1)}h</td>
                            <td className="px-6 py-4">
                              <span className="px-2 py-1 rounded-lg bg-gray-100 text-xs font-bold">{p.anomalieCount}</span>
                            </td>
                            <td className="px-6 py-4">
                              {p.maxSeverity && (
                                <span className={cn("px-2 py-1 rounded-lg text-[10px] font-bold uppercase border", getSeverityColor(p.maxSeverity))}>
                                  {p.maxSeverity}
                                </span>
                              )}
                            </td>
                          </tr>
                          <AnimatePresence>
                            {expandedPerson === p.osoba && (
                              <tr>
                                <td colSpan={5} className="bg-gray-50/50 p-0">
                                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
                                    <div className="p-6 space-y-3">
                                      {p.anomalie.map(a => (
                                        <div key={a.id} className="flex items-center justify-between text-xs bg-white p-3 rounded-lg border border-gray-100">
                                          <div className="flex items-center gap-3">
                                            <span className={cn("w-2 h-2 rounded-full", getSeverityColor(a.severity).split(' ')[0])} />
                                            <span className="font-bold">{a.kategoria}</span>
                                            <span className="text-gray-400">|</span>
                                            <span className="text-gray-500">{a.opis}</span>
                                          </div>
                                          <span className="text-gray-400 font-mono">{a.data}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </motion.div>
                                </td>
                              </tr>
                            )}
                          </AnimatePresence>
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </motion.div>
              )}

              {activeTab === 'anomalies' && (
                <motion.div key="anomalies" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-gray-100 flex items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="text" placeholder="Szukaj..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-10 pr-4 py-2 text-sm" />
                    </div>
                    <div className="flex items-center gap-2">
                      <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value as any)} className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 text-sm font-bold">
                        <option value="ALL">Wszystkie Statusy</option>
                        {Object.values(Severity).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="px-6 py-4 w-10">
                            <input type="checkbox" checked={filteredAnomalies.length > 0 && selectedAnomalies.size === filteredAnomalies.length} onChange={toggleSelectAll} />
                          </th>
                          <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('osoba')}>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-400 uppercase">Osoba</span>
                                <ChevronDown className={cn("w-3 h-3 transition-transform", sortConfig?.key === 'osoba' && sortConfig.direction === 'desc' ? "rotate-180" : "")} />
                              </div>
                              <input type="text" placeholder="Filtruj..." value={columnFilters.anom_osoba || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => updateColumnFilter('anom_osoba', e.target.value)} className="text-[10px] px-2 py-1 border border-gray-200 rounded bg-white font-normal" />
                            </div>
                          </th>
                          <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('data')}>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-400 uppercase">Data</span>
                                <ChevronDown className={cn("w-3 h-3 transition-transform", sortConfig?.key === 'data' && sortConfig.direction === 'desc' ? "rotate-180" : "")} />
                              </div>
                              <input type="text" placeholder="Filtruj..." value={columnFilters.anom_data || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => updateColumnFilter('anom_data', e.target.value)} className="text-[10px] px-2 py-1 border border-gray-200 rounded bg-white font-normal" />
                            </div>
                          </th>
                          <th className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('kategoria')}>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-400 uppercase">Kategoria</span>
                                <ChevronDown className={cn("w-3 h-3 transition-transform", sortConfig?.key === 'kategoria' && sortConfig.direction === 'desc' ? "rotate-180" : "")} />
                              </div>
                              <input type="text" placeholder="Filtruj..." value={columnFilters.anom_kategoria || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => updateColumnFilter('anom_kategoria', e.target.value)} className="text-[10px] px-2 py-1 border border-gray-200 rounded bg-white font-normal" />
                            </div>
                          </th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase">Status</th>
                          <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase text-right">Akcje</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {filteredAnomalies.map((a) => (
                          <tr key={a.id} onMouseEnter={() => setHoveredAnomaly(a)} onMouseLeave={() => setHoveredAnomaly(null)} onMouseMove={handleMouseMove} className="hover:bg-gray-50/50 transition-colors group">
                            <td className="px-6 py-4">
                              <input type="checkbox" checked={selectedAnomalies.has(a.id)} onChange={() => toggleSelection(a.id)} />
                            </td>
                            <td className="px-6 py-4 text-sm font-bold">{a.osoba}</td>
                            <td className="px-6 py-4 text-sm text-gray-500">{a.data}</td>
                            <td className="px-6 py-4 text-sm">{a.kategoria}</td>
                            <td className="px-6 py-4">
                              <span className={cn("px-2 py-1 rounded-lg text-[10px] font-bold uppercase border", getSeverityColor(a.severity))}>
                                {a.severity}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button onClick={() => handleDismiss(a.id)} className="p-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all">
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>

      <AnimatePresence>
        {hoveredAnomaly && hoveredAnomaly.rawRow && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} style={{ position: 'fixed', left: mousePosition.x + 20, top: mousePosition.y + 20, zIndex: 100, pointerEvents: 'none' }} className="bg-white border border-gray-200 shadow-2xl rounded-xl p-4 max-w-md overflow-hidden">
            <div className="text-[10px] font-bold text-gray-400 uppercase mb-2 border-b border-gray-100 pb-1">Podgląd wiersza</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {Object.entries(hoveredAnomaly.rawRow).map(([key, value]) => (
                <div key={key} className="flex flex-col">
                  <span className="text-[9px] font-bold text-gray-400 uppercase">{key}</span>
                  <span className="text-xs font-medium truncate max-w-[180px]">{String(value || '-')}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
