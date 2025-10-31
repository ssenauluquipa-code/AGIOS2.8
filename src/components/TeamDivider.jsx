import React, { useState, useEffect } from 'react';
import { Users, Upload, Download, RefreshCw, LinkIcon, Search, UserCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './TeamDividir.module.css';
import cjr28Logo from '../assets/28.png';

// URL de tu Google Sheets (debe ser pública)
const INTERNAL_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1X1pIEOd_UPsGjDyBjYMDHqfbAJ6VrWVVDhr2BaAO634/edit?usp=sharing';

// Equipos predefinidos
const TEAM_NAMES = ['Rojo', 'Azul', 'Verde', 'Amarillo'];
const COLORS = {
  Rojo: { color: '#EF4444', bg: '#FEE2E2' },
  Azul: { color: '#3B82F6', bg: '#DBEAFE' },
  Verde: { color: '#10B981', bg: '#D1FAE5' },
  Amarillo: { color: '#F59E0B', bg: '#FEF3C7' }
};

// Claves para localStorage
const STORAGE_KEY = 'team_assignments_v13';
const ATTENDANCE_KEY = 'team_attendance_v1';

/**
 * Convierte un enlace de Google Sheets en una URL CSV compatible
 * @param {string} url - Enlace de Google Sheets
 * @returns {string} - URL CSV lista para fetch
 */
const convertGoogleSheetsUrl = (url) => {
  if (url.includes('docs.google.com/spreadsheets')) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      const fileId = match[1];
      return `https://docs.google.com/spreadsheets/d/${fileId}/gviz/tq?tqx=out:csv`;
    }
  }
  return url;
};

/**
 * Genera una clave única para cada participante (basada en nombre o celular)
 * @param {Object} participant - Objeto del participante
 * @param {Array} headers - Encabezados del archivo
 * @returns {string} - Clave única
 */
const getParticipantKey = (participant, headers) => {
  const nameField = headers.find(h =>
    h.toLowerCase().includes('nombre') && h.toLowerCase().includes('apellido')
  );
  if (nameField && participant[nameField]) {
    return String(participant[nameField]).trim().toLowerCase();
  }

  const phoneField = headers.find(h =>
    h.toLowerCase().includes('celular') || h.toLowerCase().includes('telefono')
  );
  if (phoneField && participant[phoneField]) {
    return String(participant[phoneField]).trim();
  }

  return String(participant[headers[0]] || JSON.stringify(participant)).trim();
};

/**
 * Carga datos desde Google Sheets
 * @param {string} url - URL del archivo
 * @returns {Promise<{participants: Array, headers: Array}>}
 */
const loadFromGoogleSheets = async (url) => {
  const csvUrl = convertGoogleSheetsUrl(url);
  const response = await fetch(csvUrl);
  if (!response.ok) throw new Error('No se pudo acceder al archivo.');
  const csvText = await response.text();

  const Papa = (await import('https://cdn.jsdelivr.net/npm/papaparse@5.4.1/+esm')).default;
  const result = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  });

  if (!result.data || result.data.length === 0) {
    throw new Error('El archivo está vacío o no tiene datos válidos.');
  }

  const headers = Object.keys(result.data[0]);
  return { participants: result.data, headers };
};

/**
 * Carga datos desde un archivo Excel local
 * @param {File} file - Archivo subido por el usuario
 * @returns {Promise<{participants: Array, headers: Array}>}
 */
const loadFromExcelFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (jsonData.length < 2) throw new Error('Archivo vacío o sin encabezados.');

        const headers = jsonData[0].map(String);
        const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== null && cell !== ''));

        const participants = rows.map(row => {
          const obj = {};
          headers.forEach((header, i) => {
            obj[header] = row[i] !== undefined ? String(row[i]) : '';
          });
          return obj;
        });

        resolve({ participants, headers });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Error al leer el archivo.'));
    reader.readAsArrayBuffer(file);
  });
};

/**
 * Asigna participantes a equipos respetando asignaciones previas
 * - Si es la primera vez: divide equilibradamente por género
 * - Si ya hay asignaciones: solo asigna nuevos participantes
 * @param {Array} participants - Lista de participantes
 * @param {Array} headers - Encabezados del archivo
 * @param {Object} existingAssignments - Asignaciones previas (de localStorage)
 * @returns {Object} - { teams, assignments }
 */
const assignTeams = (participants, headers, existingAssignments = {}) => {
  const assignments = { ...existingAssignments };
  const unassigned = [];

  // Separar asignados y no asignados
  participants.forEach(p => {
    const key = getParticipantKey(p, headers);
    if (assignments[key]) {
      // Ya tiene equipo → mantener
    } else {
      unassigned.push(p);
    }
  });

  // Si no hay asignaciones previas, hacer división balanceada
  if (Object.keys(existingAssignments).length === 0) {
    const hombres = [];
    const mujeres = [];
    const otros = [];

    unassigned.forEach(p => {
      const genero = (p['SELECCIONA TU GENERO'] || '').toLowerCase().trim();
      if (genero.includes('masculino') || genero.includes('hombre') || genero === 'm') {
        hombres.push(p);
      } else if (genero.includes('femenino') || genero.includes('mujer') || genero === 'f') {
        mujeres.push(p);
      } else {
        otros.push(p);
      }
    });

    const shuffle = (arr) => {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };

    const allShuffled = [
      ...shuffle(hombres),
      ...shuffle(mujeres),
      ...shuffle(otros)
    ];

    allShuffled.forEach((person, i) => {
      const teamIndex = i % 4;
      const teamName = TEAM_NAMES[teamIndex];
      const key = getParticipantKey(person, headers);
      assignments[key] = teamName;
    });
  } else {
    // Si ya hay asignaciones, solo asignar nuevos al equipo más pequeño
    const teamCounts = TEAM_NAMES.reduce((acc, name) => {
      acc[name] = Object.values(assignments).filter(team => team === name).length;
      return acc;
    }, {});

    unassigned.forEach(p => {
      const key = getParticipantKey(p, headers);
      const smallestTeam = TEAM_NAMES.reduce((a, b) => (teamCounts[a] <= teamCounts[b] ? a : b));
      assignments[key] = smallestTeam;
      teamCounts[smallestTeam]++;
    });
  }

  // Construir equipos
  const teams = TEAM_NAMES.reduce((acc, name) => {
    acc[name] = [];
    return acc;
  }, {});

  participants.forEach(p => {
    const key = getParticipantKey(p, headers);
    const team = assignments[key];
    if (team && TEAM_NAMES.includes(team)) {
      teams[team].push(p);
    }
  });

  return { teams, assignments };
};

/**
 * Componente principal de la app
 */
export default function TeamDivider() {
  const [participants, setParticipants] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [teams, setTeams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [attendance, setAttendance] = useState({}); // Estado de asistencia

  /**
   * Carga los datos al montar el componente
   */
  useEffect(() => {
    const loadData = async () => {
      try {
        const { participants: data, headers: cols } = await loadFromGoogleSheets(INTERNAL_SHEET_URL);
        setHeaders(cols);
        setParticipants(data);

        // Cargar asignaciones previas
        const savedAssignments = localStorage.getItem(STORAGE_KEY);
        const existingAssignments = savedAssignments ? JSON.parse(savedAssignments) : {};

        // Asignar equipos
        const { teams: newTeams, assignments } = assignTeams(data, cols, existingAssignments);
        setTeams(newTeams);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));

        // Cargar asistencia
        const savedAttendance = localStorage.getItem(ATTENDANCE_KEY);
        if (savedAttendance) {
          setAttendance(JSON.parse(savedAttendance));
        }
      } catch (err) {
        console.error('Error al cargar datos:', err);
        setError(err.message || 'Error al cargar el archivo.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  /**
   * Recarga los datos desde Google Sheets
   */
  const reloadFromSheet = async () => {
    try {
      setLoading(true);
      const { participants: data, headers: cols } = await loadFromGoogleSheets(INTERNAL_SHEET_URL);
      setHeaders(cols);
      setParticipants(data);

      const savedAssignments = localStorage.getItem(STORAGE_KEY);
      const existingAssignments = savedAssignments ? JSON.parse(savedAssignments) : {};

      const { teams: newTeams, assignments } = assignTeams(data, cols, existingAssignments);
      setTeams(newTeams);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments));

      const savedAttendance = localStorage.getItem(ATTENDANCE_KEY);
      if (savedAttendance) {
        setAttendance(JSON.parse(savedAttendance));
      }

      alert(`✓ ${data.length} participantes cargados.`);
    } catch (err) {
      alert('Error al recargar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Alterna el estado de asistencia de un participante
   * @param {Object} participant - Participante a marcar
   */
  const toggleAttendance = (participant) => {
    const key = getParticipantKey(participant, headers);
    setAttendance(prev => {
      const newStatus = !prev[key];
      const updated = { ...prev, [key]: newStatus };
      localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  /**
   * Descarga los equipos en Excel con columna de asistencia
   */
  const downloadExcel = () => {
    if (!teams || participants.length === 0) return;

    const data = [['EQUIPO', ...headers, 'ASISTENCIA']];
    TEAM_NAMES.forEach(teamName => {
      teams[teamName].forEach(member => {
        const key = getParticipantKey(member, headers);
        const asistencia = attendance[key] ? 'Presente' : 'Ausente';
        const row = [teamName, ...headers.map(h => member[h] || ''), asistencia];
        data.push(row);
      });
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Equipos');
    XLSX.writeFile(wb, 'equipos_divididos.xlsx');
  };

  /**
   * Busca un participante por nombre o celular
   * @param {string} query - Texto a buscar
   */
  const findParticipantByQuery = (query) => {
    if (!query.trim()) {
      setSearchResult(null);
      return;
    }

    const lowerQuery = query.toLowerCase().trim();
    const found = participants.find(p => {
      const nameValue = p['NOMBRE Y APELLIDO'] ? String(p['NOMBRE Y APELLIDO']).toLowerCase() : '';
      const phoneValue = p['ESCRIBE TU NUMERO DE CELULAR'] ? String(p['ESCRIBE TU NUMERO DE CELULAR']).toLowerCase() : '';
      return nameValue.includes(lowerQuery) || phoneValue.includes(lowerQuery);
    });

    if (found) {
      const key = getParticipantKey(found, headers);
      const assignments = localStorage.getItem(STORAGE_KEY)
        ? JSON.parse(localStorage.getItem(STORAGE_KEY))
        : {};
      const team = assignments[key] || 'Sin asignar';

      setSearchResult({
        participant: found,
        team,
        color: COLORS[team] || null
      });
    } else {
      setSearchResult({ notFound: true });
    }
  };

  // Pantalla de carga
  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner}></div>
        <p>Cargando participantes del campamento...</p>
      </div>
    );
  }

  // Pantalla de error
  if (error) {
    return (
      <div className={styles.fullScreen} style={{ background: 'linear-gradient(135deg, #ef4444, #f87171)' }}>
        <div className={styles.mainCard} style={{ padding: '1.5rem', textAlign: 'center' }}>
          <h2 style={{ color: '#ef4444', fontSize: '1.3rem' }}>❌ Error</h2>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  // Renderizado principal
  return (
    <div className={styles.fullScreen}>
      <div className={styles.mainCard}>
        
        {/* Header con logo y título */}
        <div className={styles.header}>
          <img src={cjr28Logo} alt="CJR28" />
          <div className={styles.headerText}>
            <h1>🎨 División de Equipos - Campamento</h1>
            <p>Participantes asignados por colores • Datos en tiempo real</p>
          </div>
          <div style={{ width: '2.8rem' }}></div>
        </div>

        <div className={styles.content}>
          
          {/* Resumen centrado */}
          <div className={styles.summaryCentered}>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabelCentered}>Total registrados:</span>
              <span className={styles.summaryValueCentered}>{participants.length}</span>
            </div>
            
            {participants.length > 0 && (() => {
              const generos = participants.reduce((acc, p) => {
                const g = p['SELECCIONA TU GENERO'] || 'No especificado';
                acc[g] = (acc[g] || 0) + 1;
                return acc;
              }, {});
              
              return (
                <div>
                  <span className={styles.summaryLabelCentered}>Género:</span>
                  <div className={styles.genderTagsCentered}>
                    {Object.entries(generos).map(([gen, count]) => (
                      <span key={gen} className={styles.genderTagCentered}>
                        {gen}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Búsqueda */}
          <div className={styles.searchSection}>
            <h3>
              <Search size={16} /> ¿En qué equipo estoy?
            </h3>
            <div className={styles.inputGroup}>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nombre completo o número de celular..."
                onKeyPress={(e) => e.key === 'Enter' && findParticipantByQuery(searchQuery)}
              />
              <button onClick={() => findParticipantByQuery(searchQuery)}>
                Buscar
              </button>
            </div>
            {searchResult && (
              <div className={styles.searchResult}>
                {searchResult.notFound ? (
                  <p>❌ No se encontró ningún participante.</p>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <UserCheck color="#0ea5e9" size={16} style={{ marginTop: '2px' }} />
                    <div>
                      <p style={{ fontWeight: '600', color: '#1e4155', fontSize: '0.9rem' }}>
                        {searchResult.participant['NOMBRE Y APELLIDO'] || '—'}
                      </p>
                      <p style={{ marginTop: '0.1rem', fontSize: '0.8rem' }}>
                        <strong>Equipo:</strong>{' '}
                        <span
                          style={{
                            backgroundColor: searchResult.color?.color || '#6b7280',
                            color: 'white',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '12px',
                            fontSize: '0.7rem'
                          }}
                        >
                          {searchResult.team}
                        </span>
                      </p>
                      {/* Toggle de asistencia en búsqueda */}
                      <div 
                        className={styles.attendanceToggle}
                        style={{ marginTop: '0.5rem' }}
                        onClick={() => toggleAttendance(searchResult.participant)}
                      >
                        <input
                          type="checkbox"
                          checked={!!attendance[getParticipantKey(searchResult.participant, headers)]}
                          readOnly
                        />
                        <span className={
                          attendance[getParticipantKey(searchResult.participant, headers)] 
                            ? styles.attendancePresent 
                            : styles.attendanceAbsent
                        }>
                          {attendance[getParticipantKey(searchResult.participant, headers)] ? 'Presente' : 'Ausente'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Equipos */}
          <div className={styles.teamsGrid}>
            {TEAM_NAMES.map(teamName => {
              const members = teams[teamName];
              const color = COLORS[teamName];
              return (
                <div key={teamName} className={styles.teamCard} style={{ backgroundColor: color.bg }}>
                  <div className={styles.teamHeader} style={{ backgroundColor: color.color }}>
                    <h3 className={styles.teamTitle}>
                      <span
                        style={{
                          display: 'inline-block',
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: 'white',
                          marginRight: '6px'
                        }}
                      ></span>
                      Equipo {teamName}
                    </h3>
                    <span className={styles.teamCount}>{members.length}</span>
                  </div>
                  <div className={styles.participantsList}>
                    {members.length === 0 ? (
                      <div className={styles.noParticipants}>Sin participantes</div>
                    ) : (
                      members.map((member, i) => {
                        const nombre = member['NOMBRE Y APELLIDO'] || '—';
                        const edad = member['ESCRIBE TU EDAD'] || '—';
                        const iglesia = member['SELECCIONA TU IGLESIA ( si no aparece tu iglesia puedes escribirlo en "otros" o seleccionar invitado si no asistes a ninguna iglesia)'] || '—';
                        const talla = member['SELECCIONA  TALLA'] || '—';

                        return (
                          <div key={i} className={styles.participantCard}>
                            <h4>{nombre}</h4>
                            <div className={styles.participantData}>
                              <div><strong>Edad:</strong> {edad}</div>
                              <div><strong>Talla:</strong> {talla}</div>
                              <div><strong>Iglesia:</strong> {iglesia}</div>
                            </div>
                            {/* Toggle de asistencia en tarjeta */}
                            <div 
                              className={styles.attendanceToggle}
                              onClick={() => toggleAttendance(member)}
                            >
                              <input
                                type="checkbox"
                                checked={!!attendance[getParticipantKey(member, headers)]}
                                readOnly
                              />
                              <span className={
                                attendance[getParticipantKey(member, headers)] 
                                  ? styles.attendancePresent 
                                  : styles.attendanceAbsent
                              }>
                                {attendance[getParticipantKey(member, headers)] ? 'Presente' : 'Ausente'}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <button onClick={downloadExcel} className={styles.downloadBtn}>
            <Download size={16} /> Descargar Equipos en Excel
          </button>
        </div>
      </div>
    </div>
  );
}