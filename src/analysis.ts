import { 
  TimeEntry, 
  Anomaly, 
  Severity, 
  AnalysisResult, 
  PersonStat, 
  ProjectStat,
  TaskStat
} from "./types";
import { isWeekend, parse, format, startOfWeek, endOfMonth, isSameDay, isSameMonth } from "date-fns";

export function analyzeTimeEntries(
  entries: TimeEntry[],
  requiredHours: number,
  billableProjects: string[],
  internalProjects: string[]
): AnalysisResult {
  const anomalies: Anomaly[] = [];
  const personStats: Record<string, PersonStat> = {};
  const projectStats: Record<string, ProjectStat> = {};
  const taskStatsMap: Record<string, TaskStat> = {};
  
  const entriesByPerson: Record<string, TimeEntry[]> = {};
  const entriesByPersonAndDate: Record<string, Record<string, TimeEntry[]>> = {};
  const entriesByDate: Record<string, TimeEntry[]> = {};

  // Grouping
  entries.forEach(entry => {
    const fullName = `${entry.imie} ${entry.nazwisko}`.trim();
    if (!entriesByPerson[fullName]) entriesByPerson[fullName] = [];
    entriesByPerson[fullName].push(entry);

    if (!entriesByPersonAndDate[fullName]) entriesByPersonAndDate[fullName] = {};
    if (!entriesByPersonAndDate[fullName][entry.data]) entriesByPersonAndDate[fullName][entry.data] = [];
    entriesByPersonAndDate[fullName][entry.data].push(entry);

    if (!entriesByDate[entry.data]) entriesByDate[entry.data] = [];
    entriesByDate[entry.data].push(entry);
  });

  const severityWeights = {
    [Severity.CRITICAL]: 10,
    [Severity.HIGH]: 5,
    [Severity.MEDIUM]: 2,
    [Severity.LOW]: 1
  };

  // 1. Per entry anomalies (Categories A, B, D, E, F)
  entries.forEach((entry, index) => {
    const fullName = `${entry.imie} ${entry.nazwisko}`.trim();
    const entryId = `entry-${index}`;

    // --- CATEGORY A: DATA QUALITY ---
    // A1. BRAK OPISU (LOW)
    if (entry.godziny > 0 && (!entry.opis || entry.opis.trim() === "" || entry.opis.trim() === "-")) {
      anomalies.push({
        id: `${entryId}-A1`,
        osoba: fullName,
        data: entry.data,
        projekt: entry.projekt,
        zadanie: entry.zadanie,
        godziny: entry.godziny,
        kategoria: "Jakość danych. BRAK OPISU",
        severity: Severity.LOW,
        opis: "Pole Opis jest puste.",
        wpisOpis: entry.opis,
        rawRow: entry.rawRow
      });
    }

    // A2. OPIS OGOLNIKOWY (LOW)
    const genericTerms = ["development", "testy", "daily", "spotkanie", "praca", "zadania"];
    const descLower = entry.opis.trim().toLowerCase();
    const taskLower = entry.zadanie.toLowerCase();
    if (entry.godziny > 0 && entry.opis.trim() !== "") {
      const wordCount = entry.opis.trim().split(/\s+/).length;
      if (wordCount < 3 || genericTerms.includes(descLower) || descLower === taskLower) {
        anomalies.push({
          id: `${entryId}-A2`,
          osoba: fullName,
          data: entry.data,
          projekt: entry.projekt,
          zadanie: entry.zadanie,
          godziny: entry.godziny,
          kategoria: "Jakość danych. OPIS OGÓLNIKOWY",
          severity: Severity.LOW,
          opis: "Opis zbyt krótki lub zbyt ogólny.",
          wpisOpis: entry.opis,
          rawRow: entry.rawRow
        });
      }
    }

    // A3. BRAK ZADANIA (LOW)
    const isInternalActivities = entry.projekt.toLowerCase().includes("internal activities");
    if (isInternalActivities && (!entry.zadanie || entry.zadanie.trim() === "")) {
      anomalies.push({
        id: `${entryId}-A3`,
        osoba: fullName,
        data: entry.data,
        projekt: entry.projekt,
        zadanie: entry.zadanie,
        godziny: entry.godziny,
        kategoria: "Jakość danych. BRAK ZADANIA",
        severity: Severity.LOW,
        opis: "Pole Zadanie jest puste w projekcie Internal Activities.",
        wpisOpis: entry.opis,
        rawRow: entry.rawRow
      });
    }

    // A7. OPIS ZAWIERA TYLKO NAZWE NARZEDZIA (LOW)
    const tools = ["jira", "teams", "slack", "figma", "zoom", "meet"];
    if (tools.includes(descLower)) {
      anomalies.push({
        id: `${entryId}-A7`,
        osoba: fullName,
        data: entry.data,
        projekt: entry.projekt,
        zadanie: entry.zadanie,
        godziny: entry.godziny,
        kategoria: "Jakość danych. NAZWA NARZĘDZIA",
        severity: Severity.LOW,
        opis: "Opis zawiera tylko nazwę narzędzia.",
        wpisOpis: entry.opis,
        rawRow: entry.rawRow
      });
    }

    // A8. BRAK OPISU PRZY DUZEJ LICZBIE GODZIN (MEDIUM)
    if (entry.godziny > 4 && (!entry.opis || entry.opis.trim() === "")) {
      anomalies.push({
        id: `${entryId}-A8`,
        osoba: fullName,
        data: entry.data,
        projekt: entry.projekt,
        zadanie: entry.zadanie,
        godziny: entry.godziny,
        kategoria: "Jakość danych. BRAK OPISU (>4h)",
        severity: Severity.MEDIUM,
        opis: "Brak opisu przy wpisie powyżej 4h.",
        wpisOpis: entry.opis,
        rawRow: entry.rawRow
      });
    }

    // --- CATEGORY B: TIME ANOMALIES ---
    // B13. POJEDYNCZY WPIS >8H (MEDIUM)
    if (entry.godziny > 8) {
      anomalies.push({
        id: `${entryId}-B13`,
        osoba: fullName,
        data: entry.data,
        projekt: entry.projekt,
        zadanie: entry.zadanie,
        godziny: entry.godziny,
        kategoria: "Czas. WPIS >8H",
        severity: Severity.MEDIUM,
        opis: "Pojedynczy wpis przekracza 8h.",
        wpisOpis: entry.opis,
        rawRow: entry.rawRow
      });
    }

    // B14/B15. WEEKENDY
    try {
      const date = parse(entry.data, "yyyy-MM-dd", new Date());
      if (date.getDay() === 6) { // Saturday
        anomalies.push({
          id: `${entryId}-B14`,
          osoba: fullName,
          data: entry.data,
          projekt: entry.projekt,
          zadanie: entry.zadanie,
          godziny: entry.godziny,
          kategoria: "Czas. PRACA W SOBOTĘ",
          severity: Severity.MEDIUM,
          opis: "Wpis zaraportowany w sobotę.",
          wpisOpis: entry.opis,
          rawRow: entry.rawRow
        });
      } else if (date.getDay() === 0) { // Sunday
        anomalies.push({
          id: `${entryId}-B15`,
          osoba: fullName,
          data: entry.data,
          projekt: entry.projekt,
          zadanie: entry.zadanie,
          godziny: entry.godziny,
          kategoria: "Czas. PRACA W NIEDZIELĘ",
          severity: Severity.HIGH,
          opis: "Wpis zaraportowany w niedzielę.",
          wpisOpis: entry.opis,
          rawRow: entry.rawRow
        });
      }
    } catch (e) {}

    // B17. WPIS O GODZINIE 0.0 (LOW)
    if (entry.godziny === 0 && (!entry.nieobecnosc || entry.nieobecnosc.trim() === "")) {
      anomalies.push({
        id: `${entryId}-B17`,
        osoba: fullName,
        data: entry.data,
        projekt: entry.projekt,
        zadanie: entry.zadanie,
        godziny: entry.godziny,
        kategoria: "Czas. WPIS 0.0h",
        severity: Severity.LOW,
        opis: "Wpis z zerową liczbą godzin bez nieobecności.",
        wpisOpis: entry.opis,
        rawRow: entry.rawRow
      });
    }

    // B18. GODZINY UJEMNE LUB NIENUMERYCZNE (CRITICAL)
    if (entry.godziny < 0 || isNaN(entry.godziny)) {
      anomalies.push({
        id: `${entryId}-B18`,
        osoba: fullName,
        data: entry.data,
        projekt: entry.projekt,
        zadanie: entry.zadanie,
        godziny: entry.godziny,
        kategoria: "Czas. BŁĘDNE GODZINY",
        severity: Severity.CRITICAL,
        opis: "Wartość godzin jest ujemna lub nieprawidłowa.",
        wpisOpis: entry.opis,
        rawRow: entry.rawRow
      });
    }

    // B19. MIKROCZAS (<0.25H) (LOW)
    if (entry.godziny > 0 && entry.godziny < 0.25) {
      anomalies.push({
        id: `${entryId}-B19`,
        osoba: fullName,
        data: entry.data,
        projekt: entry.projekt,
        zadanie: entry.zadanie,
        godziny: entry.godziny,
        kategoria: "Czas. MIKROCZAS",
        severity: Severity.LOW,
        opis: "Wpis poniżej 15 minut.",
        wpisOpis: entry.opis,
        rawRow: entry.rawRow
      });
    }

    // --- CATEGORY E: BILLABLE vs NON-BILLABLE ---
    // E44. NADMIERNE SPOTKANIA WEWNETRZNE
    if (taskLower.includes("spotkania wewnętrzne") && entry.godziny > 4) {
      anomalies.push({
        id: `${entryId}-E44`,
        osoba: fullName,
        data: entry.data,
        projekt: entry.projekt,
        zadanie: entry.zadanie,
        godziny: entry.godziny,
        kategoria: "Billable/Non-billable. NADMIERNE SPOTKANIA",
        severity: Severity.MEDIUM,
        opis: "Pojedynczy wpis na spotkania wewnętrzne > 4h.",
        wpisOpis: entry.opis,
        rawRow: entry.rawRow
      });
    }

    // E47. SAMOROZWOJ BEZ OPISU (MEDIUM)
    if (taskLower.includes("samorozwój") && (!entry.opis || entry.opis.trim() === "")) {
      anomalies.push({
        id: `${entryId}-E47`,
        osoba: fullName,
        data: entry.data,
        projekt: entry.projekt,
        zadanie: entry.zadanie,
        godziny: entry.godziny,
        kategoria: "Billable/Non-billable. SAMOROZWÓJ BEZ OPISU",
        severity: Severity.MEDIUM,
        opis: "Godziny na samorozwój bez opisu merytorycznego.",
        wpisOpis: entry.opis,
        rawRow: entry.rawRow
      });
    }
  });

  // 2. Per person/day anomalies (B11, D33, D34, F51, F52, F58)
  Object.entries(entriesByPersonAndDate).forEach(([fullName, dates]) => {
    Object.entries(dates).forEach(([dateStr, dayEntries]) => {
      const totalDayHours = dayEntries.reduce((sum, e) => sum + e.godziny, 0);
      const hasAbsence = dayEntries.some(e => e.nieobecnosc && e.nieobecnosc.trim() !== "");
      const absenceHours = dayEntries.some(e => e.nieobecnosc.includes("8h")) ? 8 : 0;
      
      // B11. PRZEKROCZENIE 10H W DNIU (HIGH)
      if (totalDayHours > 10) {
        anomalies.push({
          id: `day-${fullName}-${dateStr}-B11`,
          osoba: fullName,
          data: dateStr,
          projekt: "Wiele",
          godziny: totalDayHours,
          kategoria: "Czas. >10h W DNIU",
          severity: Severity.HIGH,
          opis: `Suma godzin w dniu przekracza 10h (${totalDayHours}h).`,
          wpisOpis: "-",
          rawRow: dayEntries[0].rawRow
        });
      }

      // D33/D34. CONTEXT SWITCHING
      const uniqueProjects = new Set(dayEntries.map(e => e.projekt));
      if (uniqueProjects.size >= 6) {
        anomalies.push({
          id: `day-${fullName}-${dateStr}-D34`,
          osoba: fullName,
          data: dateStr,
          projekt: "Wiele",
          godziny: totalDayHours,
          kategoria: "Projekty. CONTEXT SWITCHING (6+)",
          severity: Severity.MEDIUM,
          opis: `Praca nad ${uniqueProjects.size} projektami jednego dnia.`,
          wpisOpis: "-",
          rawRow: dayEntries[0].rawRow
        });
      } else if (uniqueProjects.size >= 4) {
        anomalies.push({
          id: `day-${fullName}-${dateStr}-D33`,
          osoba: fullName,
          data: dateStr,
          projekt: "Wiele",
          godziny: totalDayHours,
          kategoria: "Projekty. CONTEXT SWITCHING (4+)",
          severity: Severity.LOW,
          opis: `Praca nad ${uniqueProjects.size} projektami jednego dnia.`,
          wpisOpis: "-",
          rawRow: dayEntries[0].rawRow
        });
      }

      // F51. PRACA + URLOP > 8H
      if (hasAbsence && totalDayHours + absenceHours > 8) {
        anomalies.push({
          id: `day-${fullName}-${dateStr}-F51`,
          osoba: fullName,
          data: dateStr,
          projekt: "Wiele",
          godziny: totalDayHours,
          kategoria: "Nieobecności. KOLIZJA PRACA+URLOP",
          severity: Severity.CRITICAL,
          opis: "Suma godzin pracy i urlopu przekracza 8h.",
          wpisOpis: "-",
          rawRow: dayEntries[0].rawRow
        });
      }

      // F58. PRACA W DNIU CALODZIENNEJ NIEOBECNOSCI
      if (absenceHours >= 8 && totalDayHours > 0) {
        anomalies.push({
          id: `day-${fullName}-${dateStr}-F58`,
          osoba: fullName,
          data: dateStr,
          projekt: "Wiele",
          godziny: totalDayHours,
          kategoria: "Nieobecności. PRACA NA URLOPIE",
          severity: Severity.CRITICAL,
          opis: "Zaraportowano godziny pracy w dniu całodniowej nieobecności.",
          wpisOpis: "-",
          rawRow: dayEntries[0].rawRow
        });
      }
    });
  });

  // 3. Per person overall anomalies (A4, B12, C22, H71-H75)
  Object.entries(entriesByPerson).forEach(([fullName, personEntries]) => {
    const totalHours = personEntries.reduce((sum, e) => sum + e.godziny, 0);
    const sortedEntries = [...personEntries].sort((a, b) => a.data.localeCompare(b.data));

    // A4. OPIS COPY-PASTE (MEDIUM)
    let identicalCount = 1;
    for (let i = 1; i < sortedEntries.length; i++) {
      if (sortedEntries[i].opis === sortedEntries[i-1].opis && sortedEntries[i].opis.trim() !== "" && sortedEntries[i].opis !== "-") {
        identicalCount++;
        if (identicalCount === 4) {
          anomalies.push({
            id: `person-${fullName}-A4-${sortedEntries[i].data}`,
            osoba: fullName,
            data: sortedEntries[i].data,
            projekt: sortedEntries[i].projekt,
            godziny: sortedEntries[i].godziny,
            kategoria: "Jakość danych. OPIS COPY-PASTE",
            severity: Severity.MEDIUM,
            opis: "Identyczny opis zadań przez więcej niż 3 dni robocze z rzędu.",
            wpisOpis: sortedEntries[i].opis,
            rawRow: sortedEntries[i].rawRow
          });
        }
      } else {
        identicalCount = 1;
      }
    }

    // C22. ZAWSZE DOKLADNIE 8.0H (MEDIUM)
    const dailyTotals: Record<string, number> = {};
    personEntries.forEach(e => {
      dailyTotals[e.data] = (dailyTotals[e.data] || 0) + e.godziny;
    });
    const eightsCount = Object.values(dailyTotals).filter(h => h === 8).length;
    if (eightsCount > 10) {
      anomalies.push({
        id: `person-${fullName}-C22`,
        osoba: fullName,
        data: "Cały okres",
        projekt: "Wszystkie",
        godziny: totalHours,
        kategoria: "Wzorce. ZAWSZE 8.0h",
        severity: Severity.MEDIUM,
        opis: "Osoba raportuje dokładnie 8.0h przez ponad 10 dni roboczych.",
        wpisOpis: "-",
        rawRow: personEntries[0].rawRow
      });
    }

    // H71-H75. INFLACJA/BRAKI GODZIN
    const ratio = totalHours / requiredHours;
    if (ratio > 1.2) {
      anomalies.push({
        id: `person-${fullName}-H75`,
        osoba: fullName,
        data: "Miesiąc",
        projekt: "Wszystkie",
        godziny: totalHours,
        kategoria: "Efektywność. INFLACJA GODZIN (>120%)",
        severity: Severity.HIGH,
        opis: `Zaraportowano ponad 120% normy (${totalHours}h / ${requiredHours}h).`,
        wpisOpis: "-",
        rawRow: personEntries[0].rawRow
      });
    }

    // Stats per person
    personStats[fullName] = {
      osoba: fullName,
      przelozony: personEntries[0].przelozony,
      godziny: totalHours,
      wymagane: requiredHours,
      anomalieCount: 0,
      maxSeverity: null,
      anomalie: []
    };
  });

  // 4. Cross-person anomalies (A9)
  Object.entries(entriesByDate).forEach(([dateStr, dayEntries]) => {
    const descMap: Record<string, string[]> = {};
    dayEntries.forEach(e => {
      if (e.opis.trim().length > 10) {
        if (!descMap[e.opis]) descMap[e.opis] = [];
        descMap[e.opis].push(`${e.imie} ${e.nazwisko}`);
      }
    });
    Object.entries(descMap).forEach(([desc, people]) => {
      if (people.length >= 3) {
        anomalies.push({
          id: `date-${dateStr}-A9-${desc.substring(0, 10)}`,
          osoba: "Wiele osób",
          data: dateStr,
          projekt: "Wiele",
          godziny: 0,
          kategoria: "Jakość danych. IDENTYCZNY OPIS (GRUPA)",
          severity: Severity.MEDIUM,
          opis: `Ten sam opis u ${people.length} osób: ${people.join(', ')}`,
          wpisOpis: desc,
          rawRow: dayEntries[0].rawRow
        });
      }
    });
  });

  // J100. COMPOUND ANOMALY
  // We'll check if a person has 3+ anomalies on the same day
  Object.entries(entriesByPersonAndDate).forEach(([fullName, dates]) => {
    Object.entries(dates).forEach(([dateStr, _]) => {
      const dayAnomalies = anomalies.filter(a => a.osoba === fullName && a.data === dateStr);
      if (dayAnomalies.length >= 3) {
        anomalies.push({
          id: `compound-${fullName}-${dateStr}`,
          osoba: fullName,
          data: dateStr,
          projekt: "Wiele",
          godziny: 0,
          kategoria: "Remote/T&M. COMPOUND ANOMALY",
          severity: Severity.HIGH,
          opis: `Wykryto ${dayAnomalies.length} różnych anomalii tego samego dnia.`,
          wpisOpis: "-",
          rawRow: dayAnomalies[0].rawRow
        });
      }
    });
  });

  // Final assembly and stats mapping
  anomalies.forEach(a => {
    if (personStats[a.osoba]) {
      personStats[a.osoba].anomalieCount++;
      personStats[a.osoba].anomalie.push(a);
      const order = { [Severity.CRITICAL]: 4, [Severity.HIGH]: 3, [Severity.MEDIUM]: 2, [Severity.LOW]: 1 };
      const currentMax = personStats[a.osoba].maxSeverity ? order[personStats[a.osoba].maxSeverity!] : 0;
      if (order[a.severity] > currentMax) personStats[a.osoba].maxSeverity = a.severity;
    }
  });

  // Task Stats
  entries.forEach(e => {
    const key = `${e.projekt}|${e.zadanie}`;
    if (!taskStatsMap[key]) {
      const isBillable = billableProjects.some(p => e.projekt.toLowerCase().includes(p.toLowerCase()));
      const isInternal = internalProjects.some(p => e.projekt.toLowerCase().includes(p.toLowerCase()));
      taskStatsMap[key] = {
        projekt: e.projekt,
        zadanie: e.zadanie,
        typ: isBillable ? "Kliencki" : isInternal ? "Wewnętrzny" : "Nieznany",
        godziny: 0,
        osobyCount: 0,
        anomalieCount: 0
      };
    }
    taskStatsMap[key].godziny += e.godziny;
    taskStatsMap[key].anomalieCount += anomalies.filter(a => a.projekt === e.projekt && a.data === e.data && a.osoba.includes(e.imie)).length;
  });

  // Project Stats
  entries.forEach(e => {
    if (!projectStats[e.projekt]) {
      const isBillable = billableProjects.some(p => e.projekt.toLowerCase().includes(p.toLowerCase()));
      const isInternal = internalProjects.some(p => e.projekt.toLowerCase().includes(p.toLowerCase()));
      projectStats[e.projekt] = {
        projekt: e.projekt,
        typ: isBillable ? "Kliencki" : isInternal ? "Wewnętrzny" : "Nieznany",
        godziny: 0,
        osoby: new Set(),
        anomalieCount: 0
      };
    }
    projectStats[e.projekt].godziny += e.godziny;
    projectStats[e.projekt].osoby.add(`${e.imie} ${e.nazwisko}`);
    projectStats[e.projekt].anomalieCount += anomalies.filter(a => a.projekt === e.projekt).length;
  });

  const personAnomaliesMap: Record<string, { count: number; score: number }> = {};
  anomalies.forEach(a => {
    if (a.osoba === "Wiele osób") return;
    if (!personAnomaliesMap[a.osoba]) personAnomaliesMap[a.osoba] = { count: 0, score: 0 };
    personAnomaliesMap[a.osoba].count++;
    personAnomaliesMap[a.osoba].score += severityWeights[a.severity];
  });

  const topPeopleByCount = Object.entries(personAnomaliesMap)
    .map(([osoba, stats]) => ({ osoba, count: stats.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topPeopleByWeight = Object.entries(personAnomaliesMap)
    .map(([osoba, stats]) => ({ osoba, score: stats.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const topFindings = [...anomalies]
    .sort((a, b) => severityWeights[b.severity] - severityWeights[a.severity])
    .slice(0, 5);

  const totalAnomalies = anomalies.length;
  const anomalyHours = anomalies.reduce((sum, a) => sum + a.godziny, 0);
  const totalWeight = anomalies.reduce((sum, a) => sum + severityWeights[a.severity], 0);
  const riskScore = Math.min(100, Math.round((totalWeight / (entries.length || 1)) * 50));

  return {
    totalHours: entries.reduce((sum, e) => sum + e.godziny, 0),
    totalAnomalies,
    anomalyHours,
    riskScore,
    anomalies,
    personStats,
    projectStats,
    taskStats: Object.values(taskStatsMap).sort((a, b) => {
      const projComp = a.projekt.localeCompare(b.projekt);
      if (projComp !== 0) return projComp;
      return a.zadanie.localeCompare(b.zadanie);
    }),
    topFindings,
    recommendations: ["Wprowadź obowiązkowe szkolenie z raportowania.", "Zautomatyzuj walidację opisów.", "Monitoruj Risk Score co tydzień."],
    topPeopleByCount,
    topPeopleByWeight
  };
}
