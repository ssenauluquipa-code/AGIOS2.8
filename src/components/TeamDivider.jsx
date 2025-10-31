import React, { useState, useEffect } from 'react';
import { Users, Upload, Download, RefreshCw, LinkIcon, Search, UserCheck } from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './TeamDividir.module.css';
import cjr28Logo from '../assets/28.png';

// Configuración
const INTERNAL_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1X1pIEOd_UPsGjDyBjYMDHqfbAJ6VrWVVDhr2BaAO634/edit?usp=sharing';
const TEAM_NAMES = ['Rojo', 'Azul', 'Verde', 'Amarillo'];
const COLORS = {
  Rojo: { color: '#EF4444', bg: '#FEE2E2' },
  Azul: { color: '#3B82F6', bg: '#DBEAFE' },
  Verde: { color: '#10B981', bg: '#D1FAE5' },
  Amarillo: { color: '#F59E0B', bg: '#FEF3C7' }
};

// Claves para localStorage (asistencia)
const ATTENDANCE_KEY = 'team_attendance_v1';

// Configuración de Gist (usar variables de entorno en Vite)
const GIST_ID = import.meta.env.VITE_GIST_ID || 'b30794fa9e8b8f0aee0f63c2a3558022';
const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN; // Puede ser undefined

/**
 * Convierte URL de Google Sheets a CSV
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
 * Genera clave única para participante
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
 * Carga datos desde Excel local
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
 * Asigna equipos respetando asignaciones existentes
 */
const assignTeams = (participants, headers, existingAssignments = {}) => {
  const assignments = { ...existingAssignments };
  const unassigned = [];

  participants.forEach(p => {
    const key = getParticipantKey(p, headers);
    if (assignments[key]) {
      // Ya asignado
    } else {
      unassigned.push(p);
    }
  });

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
 * Carga asignaciones y asistencia desde GitHub Gist
 */
const loadAssignmentsFromGist = async () => {
  if (!GITHUB_TOKEN) {
    // No mostrar advertencia aquí, solo retornar vacío
    return { assignments: {}, attendance: {} };
  }

  try {
    const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
    });
    if (!response.ok) throw new Error('No se pudo cargar el Gist');
    
    const data = await response.json();
    const fileContent = data.files['team-assignments.json']?.content;
    
    if (!fileContent) return { assignments: {}, attendance: {} };
    
    const parsed = JSON.parse(fileContent);
    return {
      assignments: parsed.assignments || {},
      attendance: parsed.attendance || {}
    };
  } catch (err) {
    console.warn('Usando datos vacíos:', err.message);
    return { assignments: {}, attendance: {} };
  }
};

/**
 * Guarda asignaciones y asistencia en GitHub Gist
 */
const saveAssignmentsToGist = async (assignments, attendance) => {
  if (!GITHUB_TOKEN) {
    // No mostrar advertencia aquí, solo salir silenciosamente
    return;
  }

  try {
    const gistData = {
      assignments,
      attendance
    };

    const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        description: 'Asignaciones de equipos y asistencia para el campamento',
        files: {
          'team-assignments.json': {
            content: JSON.stringify(gistData, null, 2)
          }
        }
      })
    });
    
    if (!response.ok) throw new Error('No se pudo guardar en el Gist');
    console.log('Asignaciones y asistencia guardadas en Gist');
  } catch (err) {
    console.error('Error al guardar en Gist:', err);
    alert('⚠️ No se pudieron guardar los datos. Los equipos o asistencia podrían cambiar al recargar.');
  }
};

export default function TeamDivider() {
  const [participants, setParticipants] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [teams, setTeams] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [attendance, setAttendance] = useState({});

  /**
   * Carga datos al iniciar
   */
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Cargar participantes
        const { participants: data, headers: cols } = await loadFromGoogleSheets(INTERNAL_SHEET_URL);
        setHeaders(cols);
        setParticipants(data);

        // Cargar asignaciones y asistencia desde Gist
        const { assignments: existingAssignments, attendance: existingAttendance } = await loadAssignmentsFromGist();

        // Asignar equipos
        const { teams: newTeams, assignments } = assignTeams(data, cols, existingAssignments);
        setTeams(newTeams);

        // Combinar asistencia existente con la local (por si alguien marcó asistencia localmente)
        const localAttendance = JSON.parse(localStorage.getItem(ATTENDANCE_KEY) || '{}');
        const combinedAttendance = { ...existingAttendance, ...localAttendance };
        setAttendance(combinedAttendance);

        // Guardar en Gist (asignaciones + asistencia combinada)
        await saveAssignmentsToGist(assignments, combinedAttendance);

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
   * Recargar desde Google Sheets
   */
  const reloadFromSheet = async () => {
    try {
      setLoading(true);
      const { participants: data, headers: cols } = await loadFromGoogleSheets(INTERNAL_SHEET_URL);
      setHeaders(cols);
      setParticipants(data);

      const { assignments: existingAssignments, attendance: existingAttendance } = await loadAssignmentsFromGist();
      const { teams: newTeams, assignments } = assignTeams(data, cols, existingAssignments);
      setTeams(newTeams);
      await saveAssignmentsToGist(assignments, existingAttendance);

      // Cargar asistencia (local)
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
   * Alternar asistencia y guardar en Gist
   */
  const toggleAttendance = (participant) => {
    const key = getParticipantKey(participant, headers);
    setAttendance(prev => {
      const newStatus = !prev[key];
      const updated = { ...prev, [key]: newStatus };
      
      // Guardar localmente
      localStorage.setItem(ATTENDANCE_KEY, JSON.stringify(updated));
      
      // Guardar en Gist también
      saveAssignmentsToGist(
        JSON.parse(localStorage.getItem('team_assignments_v13') || '{}'), 
        updated
      );
      
      return updated;
    });
  };

  /**
   * Descargar Excel
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
   * Buscar participante
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
      const assignments = localStorage.getItem('team_assignments_v13')
        ? JSON.parse(localStorage.getItem('team_assignments_v13'))
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

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.spinner}></div>
        <p>Cargando participantes del campamento...</p>
      </div>
    );
  }

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

  return (
    <div className={styles.fullScreen}>
      <div className={styles.mainCard}>
        
        {/* Indicador visual si no hay token */}
        {!GITHUB_TOKEN && (
          <div style={{
            backgroundColor: '#fef3c7',
            color: '#92400e',
            padding: '0.5rem',
            textAlign: 'center',
            fontSize: '0.8rem',
            margin: '0 0.75rem'
          }}>
            ⚠️ Sin token de GitHub: las asignaciones no se guardarán
          </div>
        )}

        <div className={styles.header}>
          <img src={cjr28Logo} alt="CJR28" />
          <div className={styles.headerText}>
            <h1>División de Equipos - Campamento AGIOS 2.8</h1>
            <p>Participantes asignados por colores • Datos en tiempo real</p>
          </div>
          <div style={{ width: '2.8rem' }}></div>
        </div>

        <div className={styles.content}>
          
          {/* Resumen centrado */}
          <div className={styles.summaryCentered}>
            {/* <div className={styles.summaryRow}>
              <span className={styles.summaryLabelCentered}>Total registrados:</span>
              <span className={styles.summaryValueCentered}>{participants.length}</span>
            </div> */}
            
            {participants.length > 0 && (() => {
              const generos = participants.reduce((acc, p) => {
                const g = p['SELECCIONA TU GENERO'] || 'No especificado';
                acc[g] = (acc[g] || 0) + 1;
                return acc;
              }, {});
              
              return (
                <div>
                  {/* <span className={styles.summaryLabelCentered}>Género:</span> */}
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
                            {/* Toggle de asistencia */}
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