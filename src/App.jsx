import { useState, useEffect } from 'react'
import { initAuth } from './firebase'
import { useCollection } from './useFirestore'
import './App.css'

const COLORS = ['#1a73e8','#ea4335','#34a853','#ff6b35','#9c27b0','#00acc1','#e91e63','#ff9800']
const CHART_COLORS = ['#1a73e8','#ea4335','#34a853','#ff6b35','#9c27b0','#00acc1','#e91e63','#ff9800']

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function resizeImage(file, maxSize = 150) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = maxSize
        canvas.height = maxSize
        const ctx = canvas.getContext('2d')
        const min = Math.min(img.width, img.height)
        const sx = (img.width - min) / 2
        const sy = (img.height - min) / 2
        ctx.drawImage(img, sx, sy, min, min, 0, 0, maxSize, maxSize)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = e.target.result
    }
    reader.readAsDataURL(file)
  })
}

function Avatar({ player, size = 44, onClick }) {
  const style = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: size * 0.4, fontWeight: 600, color: 'white',
    background: player.photo ? `url(${player.photo}) center/cover` : player.color,
    cursor: onClick ? 'pointer' : 'default',
    border: player.photo ? '2px solid var(--border-light)' : 'none',
  }
  return (
    <div style={style} onClick={onClick} title={onClick ? 'Click to change photo' : undefined}>
      {!player.photo && getInitials(player.name)}
    </div>
  )
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function ConfirmModal({ message, confirmLabel = 'Yes, delete', onConfirm, onCancel }) {
  const [step, setStep] = useState(1)
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360, textAlign: 'center' }}>
        {step === 1 ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ marginBottom: 8, fontSize: 18 }}>Are you sure?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>{message}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1, background: 'var(--border-light)', color: 'var(--text)' }} onClick={onCancel}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, background: 'var(--danger)' }} onClick={() => setStep(2)}>
                {confirmLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🚨</div>
            <h2 style={{ marginBottom: 8, fontSize: 18 }}>Really sure?</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>This cannot be undone.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ flex: 1, background: 'var(--border-light)', color: 'var(--text)' }} onClick={onCancel}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1, background: 'var(--danger)' }} onClick={onConfirm}>
                Yes, I'm sure
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function normalizeSets(sets) {
  if (!sets) return []
  return sets.map(s => Array.isArray(s) ? s : [s.t1, s.t2])
}

function getPlayerResult(m, playerId) {
  const onTeam1 = m.team1.includes(playerId)
  const onTeam2 = m.team2.includes(playerId)
  if (!onTeam1 && !onTeam2) return null
  const t1sets = m.sets.filter(s => s[0] > s[1]).length
  const t1won = t1sets >= 2
  const won = (onTeam1 && t1won) || (onTeam2 && !t1won)
  return { won, onTeam1 }
}

function calcElo(players, matches) {
  const K = 32
  const elo = {}
  players.forEach(p => { elo[p.id] = 1200 })
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const history = {}
  players.forEach(p => { history[p.id] = [{ match: 0, elo: 1200 }] })

  sorted.forEach((m, idx) => {
    const t1avg = m.team1.reduce((s, id) => s + (elo[id] || 1200), 0) / m.team1.length
    const t2avg = m.team2.reduce((s, id) => s + (elo[id] || 1200), 0) / m.team2.length
    const expected1 = 1 / (1 + Math.pow(10, (t2avg - t1avg) / 400))
    const t1won = m.sets.filter(s => s[0] > s[1]).length >= 2
    const score1 = t1won ? 1 : 0

    m.team1.forEach(id => {
      if (!elo[id]) elo[id] = 1200
      elo[id] += K * (score1 - expected1)
      if (!history[id]) history[id] = []
      history[id].push({ match: idx + 1, elo: Math.round(elo[id]) })
    })
    m.team2.forEach(id => {
      if (!elo[id]) elo[id] = 1200
      elo[id] += K * ((1 - score1) - (1 - expected1))
      if (!history[id]) history[id] = []
      history[id].push({ match: idx + 1, elo: Math.round(elo[id]) })
    })
  })

  return { elo, history, totalMatches: sorted.length }
}

function WinRateChart({ players, matches }) {
  if (matches.length < 2) return null
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  const activePlayers = players.filter(p => matches.some(m => getPlayerResult(m, p.id)))

  const lines = activePlayers.map((p, pi) => {
    let wins = 0, total = 0
    const points = []
    sorted.forEach((m, i) => {
      const r = getPlayerResult(m, p.id)
      if (!r) return
      total++
      if (r.won) wins++
      points.push({ x: i, y: (wins / total) * 100 })
    })
    return { player: p, points, color: CHART_COLORS[pi % CHART_COLORS.length] }
  }).filter(l => l.points.length > 0)

  const W = 600, H = 250, PAD = { top: 20, right: 20, bottom: 30, left: 40 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const maxX = sorted.length - 1 || 1

  function toX(x) { return PAD.left + (x / maxX) * plotW }
  function toY(y) { return PAD.top + plotH - (y / 100) * plotH }

  return (
    <div className="card">
      <h2>Win Rate Over Time</h2>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
          {[0, 25, 50, 75, 100].map(v => (
            <g key={v}>
              <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)} stroke="var(--border-light)" strokeWidth="1" />
              <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end" fill="var(--text-muted)" fontSize="10">{v}%</text>
            </g>
          ))}
          <line x1={PAD.left} y1={toY(50)} x2={W - PAD.right} y2={toY(50)} stroke="var(--border)" strokeWidth="1" strokeDasharray="4" />
          {lines.map(l => (
            <g key={l.player.id}>
              <polyline
                fill="none" stroke={l.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                points={l.points.map(p => `${toX(p.x)},${toY(p.y)}`).join(' ')}
              />
              {l.points.length > 0 && (
                <circle cx={toX(l.points[l.points.length - 1].x)} cy={toY(l.points[l.points.length - 1].y)} r="4" fill={l.color} />
              )}
            </g>
          ))}
          <text x={W / 2} y={H - 4} textAnchor="middle" fill="var(--text-muted)" fontSize="10">Matches played</text>
        </svg>
      </div>
      <div className="chart-legend">
        {lines.map(l => (
          <div key={l.player.id} className="chart-legend-item">
            <span className="chart-legend-dot" style={{ background: l.color }} />
            <span>{l.player.name}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{l.points[l.points.length - 1]?.y.toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EloChart({ players, matches }) {
  const { history, totalMatches } = calcElo(players, matches)
  if (totalMatches < 2) return null
  const activePlayers = players.filter(p => history[p.id] && history[p.id].length > 1)

  const allElos = activePlayers.flatMap(p => history[p.id].map(h => h.elo))
  const minElo = Math.min(...allElos) - 20
  const maxElo = Math.max(...allElos) + 20
  const eloRange = maxElo - minElo || 1

  const W = 600, H = 250, PAD = { top: 20, right: 20, bottom: 30, left: 45 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  function toX(x) { return PAD.left + (x / totalMatches) * plotW }
  function toY(e) { return PAD.top + plotH - ((e - minElo) / eloRange) * plotH }

  const gridLines = []
  const step = eloRange > 200 ? 50 : 25
  for (let v = Math.ceil(minElo / step) * step; v <= maxElo; v += step) {
    gridLines.push(v)
  }

  return (
    <div className="card">
      <h2>ELO Rating Over Time</h2>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block' }}>
          {gridLines.map(v => (
            <g key={v}>
              <line x1={PAD.left} y1={toY(v)} x2={W - PAD.right} y2={toY(v)} stroke="var(--border-light)" strokeWidth="1" />
              <text x={PAD.left - 6} y={toY(v) + 4} textAnchor="end" fill="var(--text-muted)" fontSize="10">{v}</text>
            </g>
          ))}
          <line x1={PAD.left} y1={toY(1200)} x2={W - PAD.right} y2={toY(1200)} stroke="var(--border)" strokeWidth="1" strokeDasharray="4" />
          {activePlayers.map((p, pi) => {
            const pts = history[p.id]
            const color = CHART_COLORS[pi % CHART_COLORS.length]
            return (
              <g key={p.id}>
                <polyline
                  fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  points={pts.map(pt => `${toX(pt.match)},${toY(pt.elo)}`).join(' ')}
                />
                <circle cx={toX(pts[pts.length - 1].match)} cy={toY(pts[pts.length - 1].elo)} r="4" fill={color} />
              </g>
            )
          })}
          <text x={W / 2} y={H - 4} textAnchor="middle" fill="var(--text-muted)" fontSize="10">Matches played</text>
        </svg>
      </div>
      <div className="chart-legend">
        {activePlayers.map((p, pi) => (
          <div key={p.id} className="chart-legend-item">
            <span className="chart-legend-dot" style={{ background: CHART_COLORS[pi % CHART_COLORS.length] }} />
            <span>{p.name}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{history[p.id][history[p.id].length - 1]?.elo}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function App() {
  const [tab, setTab] = useState('stats')
  const [ready, setReady] = useState(false)
  const { items: players, loading: playersLoading, addItem: addPlayer, removeItem: removePlayer, updateItem: updatePlayer } = useCollection('players')
  const { items: matches, loading: matchesLoading, addItem: addMatch, removeItem: removeMatch, updateItem: updateMatch } = useCollection('matches')

  useEffect(() => {
    initAuth().then(() => setReady(true))
  }, [])

  if (!ready || playersLoading || matchesLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 48 }}>🎾</div>
        <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>
      </div>
    )
  }

  const normalizedMatches = matches.map(m => ({ ...m, sets: normalizeSets(m.sets) }))
  const sortedMatches = [...normalizedMatches].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))

  return (
    <>
      <header className="app-header">
        <h1><span>🎾</span> Padel Tracker</h1>
      </header>

      <nav className="nav-tabs">
        {['stats', 'matches', 'new-match', 'players'].map(t => (
          <button key={t} className={`nav-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}>
            {t === 'new-match' ? '+ Match' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {tab === 'players' && <PlayersTab players={players} addPlayer={addPlayer} removePlayer={removePlayer} updatePlayer={updatePlayer} matches={normalizedMatches} />}
      {tab === 'matches' && <MatchesTab matches={sortedMatches} removeMatch={removeMatch} players={players} updateMatch={updateMatch} />}
      {tab === 'new-match' && <NewMatchTab players={players} addMatch={addMatch} onDone={() => setTab('matches')} />}
      {tab === 'stats' && <StatsTab players={players} matches={normalizedMatches} />}
    </>
  )
}

function PlayersTab({ players, addPlayer, removePlayer, updatePlayer, matches }) {
  const [name, setName] = useState('')
  const [nickname, setNickname] = useState('')
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(null)
  const [editName, setEditName] = useState('')
  const [editNickname, setEditNickname] = useState('')
  const [editPhoto, setEditPhoto] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)

  async function handlePhotoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await resizeImage(file)
    setPhotoPreview(dataUrl)
  }

  async function handleAddPlayer(e) {
    e.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    try {
      const id = generateId()
      await addPlayer({
        id,
        name: name.trim(),
        nickname: nickname.trim(),
        color: COLORS[players.length % COLORS.length],
        photo: photoPreview || null,
      })
      setName('')
      setNickname('')
      setPhotoPreview(null)
    } finally {
      setSaving(false)
    }
  }

  function startEdit(p) {
    setEditing(p.id)
    setEditName(p.name)
    setEditNickname(p.nickname || '')
    setEditPhoto(p.photo || null)
  }

  async function handleEditPhotoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const dataUrl = await resizeImage(file)
    setEditPhoto(dataUrl)
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!editName.trim() || saving) return
    setSaving(true)
    try {
      await updatePlayer(editing, {
        name: editName.trim(),
        nickname: editNickname.trim(),
        photo: editPhoto,
      })
      setEditing(null)
    } finally {
      setSaving(false)
    }
  }

  function handleRemovePlayer(id) {
    const inMatch = matches.some(m =>
      [...m.team1, ...m.team2].includes(id)
    )
    if (inMatch) {
      alert('Cannot remove a player who has recorded matches.')
      return
    }
    setConfirmDelete(id)
  }

  async function confirmRemovePlayer() {
    await removePlayer(confirmDelete)
    setConfirmDelete(null)
  }

  function getPlayerRecord(id) {
    let w = 0, l = 0
    matches.forEach(m => {
      const r = getPlayerResult(m, id)
      if (!r) return
      if (r.won) w++; else l++
    })
    return `${w}W - ${l}L`
  }

  return (
    <>
      {confirmDelete && (
        <ConfirmModal
          message={`Delete player "${players.find(p => p.id === confirmDelete)?.name}"? This will remove their profile.`}
          onConfirm={confirmRemovePlayer}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Player</h2>
              <button className="btn btn-danger btn-sm" onClick={() => setEditing(null)}>✕</button>
            </div>
            <form onSubmit={saveEdit}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <label htmlFor="edit-photo-input" className="photo-upload">
                  {editPhoto
                    ? <img src={editPhoto} alt="Preview" style={{ width: 88, height: 88, borderRadius: '50%', objectFit: 'cover' }} />
                    : <div className="photo-upload-placeholder" style={{ width: 88, height: 88, fontSize: 24 }}>
                        <span>📷</span>
                        <span style={{ fontSize: 11 }}>Add Photo</span>
                      </div>
                  }
                </label>
                <input id="edit-photo-input" type="file" accept="image/*" onChange={handleEditPhotoSelect}
                  style={{ display: 'none' }} />
                {editPhoto && <button type="button" className="btn btn-danger btn-sm" onClick={() => setEditPhoto(null)}>Remove Photo</button>}
              </div>
              <div className="form-group">
                <label>Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Nickname</label>
                <input value={editNickname} onChange={e => setEditNickname(e.target.value)} placeholder="e.g. The Wall" />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" className="btn" style={{ background: 'var(--border-light)', color: 'var(--text)' }} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Add Player</h2>
        <form onSubmit={handleAddPlayer}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div className="photo-upload-wrapper">
              <label htmlFor="photo-input" className="photo-upload">
                {photoPreview
                  ? <img src={photoPreview} alt="Preview" style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div className="photo-upload-placeholder">
                      <span>📷</span>
                      <span style={{ fontSize: 10 }}>Photo</span>
                    </div>
                }
              </label>
              <input id="photo-input" type="file" accept="image/*" onChange={handlePhotoSelect}
                style={{ display: 'none' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="form-row">
                <div className="form-group">
                  <label>Name</label>
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jesse" required />
                </div>
                <div className="form-group">
                  <label>Nickname (optional)</label>
                  <input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="e.g. The Wall" />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ marginTop: 8 }} disabled={saving}>
                {saving ? 'Saving...' : 'Add Player'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {players.length === 0 ? (
        <div className="empty-state">
          <div className="icon">👥</div>
          <p>No players yet. Add your first player above!</p>
        </div>
      ) : (
        <div className="player-grid">
          {players.map(p => (
            <div key={p.id} className="player-card">
              <Avatar player={p} size={44} />
              <div className="player-info">
                <div className="player-name">{p.name}</div>
                {p.nickname && <div className="player-nickname">"{p.nickname}"</div>}
                <div className="player-stats-mini">{getPlayerRecord(p.id)}</div>
              </div>
              <button className="btn btn-sm" style={{ background: 'var(--border-light)', color: 'var(--text-secondary)' }} onClick={() => startEdit(p)}>✏️</button>
              <button className="btn btn-danger btn-sm" onClick={() => handleRemovePlayer(p.id)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

function NewMatchTab({ players, addMatch, onDone }) {
  const [team1, setTeam1] = useState(['', ''])
  const [team2, setTeam2] = useState(['', ''])
  const [sets, setSets] = useState([[0, 0], [0, 0], [0, 0]])
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  function updateSet(setIdx, teamIdx, value) {
    const v = Math.max(0, Math.min(7, parseInt(value) || 0))
    const next = sets.map((s, i) => i === setIdx ? (teamIdx === 0 ? [v, s[1]] : [s[0], v]) : [...s])
    setSets(next)
  }

  function needsThirdSet() {
    if (sets[0][0] === sets[0][1]) return true
    if (sets[1][0] === sets[1][1]) return true
    const s1Winner = sets[0][0] > sets[0][1] ? 1 : 2
    const s2Winner = sets[1][0] > sets[1][1] ? 1 : 2
    return s1Winner !== s2Winner
  }

  async function saveMatch(e) {
    e.preventDefault()
    if (saving) return
    const t1 = team1.filter(Boolean)
    const t2 = team2.filter(Boolean)
    if (t1.length === 0 || t2.length === 0) { alert('Select at least one player per team.'); return }
    const allSelected = [...t1, ...t2]
    if (new Set(allSelected).size !== allSelected.length) { alert('A player cannot be on both teams.'); return }

    const activeSets = needsThirdSet() ? sets : sets.slice(0, 2)
    const tied = activeSets.some(s => s[0] === s[1])
    if (tied) { alert('Each set must have a winner (no ties).'); return }

    const t1wins = activeSets.filter(s => s[0] > s[1]).length
    const t2wins = activeSets.filter(s => s[1] > s[0]).length
    if (t1wins < 2 && t2wins < 2) { alert('One team must win 2 sets.'); return }

    setSaving(true)
    try {
      await addMatch({
        id: generateId(),
        date,
        team1: t1,
        team2: t2,
        sets: activeSets.map(s => ({ t1: s[0], t2: s[1] })),
        comments: [],
      })
      setTeam1(['', ''])
      setTeam2(['', ''])
      setSets([[0, 0], [0, 0], [0, 0]])
      onDone()
    } finally {
      setSaving(false)
    }
  }

  if (players.length < 2) {
    return (
      <div className="empty-state">
        <div className="icon">🎾</div>
        <p>Add at least 2 players before recording a match.</p>
      </div>
    )
  }

  const playerOpts = players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)
  const showThird = needsThirdSet()

  return (
    <div className="card">
      <h2>Record Match</h2>
      <form onSubmit={saveMatch}>
        <div className="form-group">
          <label>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <div className="team-select">
          <h3>Team 1</h3>
          <div className="team-players">
            <select value={team1[0]} onChange={e => setTeam1([e.target.value, team1[1]])}>
              <option value="">Player 1</option>{playerOpts}
            </select>
            <select value={team1[1]} onChange={e => setTeam1([team1[0], e.target.value])}>
              <option value="">Player 2 (optional)</option>{playerOpts}
            </select>
          </div>
        </div>

        <div className="team-select">
          <h3>Team 2</h3>
          <div className="team-players">
            <select value={team2[0]} onChange={e => setTeam2([e.target.value, team2[1]])}>
              <option value="">Player 1</option>{playerOpts}
            </select>
            <select value={team2[1]} onChange={e => setTeam2([team2[0], e.target.value])}>
              <option value="">Player 2 (optional)</option>{playerOpts}
            </select>
          </div>
        </div>

        <div className="set-scores">
          {[0, 1, 2].map(i => (
            (i < 2 || showThird) && (
              <div key={i} className="set-row">
                <span className="set-label">Set {i + 1}</span>
                <input className="score-input" type="number" min="0" max="7"
                  value={sets[i][0]} onChange={e => updateSet(i, 0, e.target.value)} />
                <span className="vs-label">vs</span>
                <input className="score-input" type="number" min="0" max="7"
                  value={sets[i][1]} onChange={e => updateSet(i, 1, e.target.value)} />
              </div>
            )
          ))}
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save Match'}
        </button>
      </form>
    </div>
  )
}

function MatchesTab({ matches, removeMatch, players, updateMatch }) {
  const getName = id => players.find(p => p.id === id)?.name || 'Unknown'
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [filterPlayer, setFilterPlayer] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [expandedMatch, setExpandedMatch] = useState(null)
  const [commentText, setCommentText] = useState('')
  const [commentAuthor, setCommentAuthor] = useState('')

  async function confirmDeleteMatch() {
    await removeMatch(confirmDelete)
    setConfirmDelete(null)
  }

  async function addComment(matchId) {
    if (!commentText.trim() || !commentAuthor.trim()) return
    const match = matches.find(m => m.id === matchId)
    const comments = [...(match.comments || [])]
    comments.push({ author: commentAuthor.trim(), text: commentText.trim(), time: new Date().toISOString() })
    await updateMatch(matchId, { comments: comments.map(c => ({ author: c.author, text: c.text, time: c.time })) })
    setCommentText('')
  }

  const filtered = matches.filter(m => {
    if (filterPlayer && ![...m.team1, ...m.team2].includes(filterPlayer)) return false
    if (filterType === 'singles' && (m.team1.length !== 1 || m.team2.length !== 1)) return false
    if (filterType === 'doubles' && (m.team1.length !== 2 || m.team2.length !== 2)) return false
    return true
  })

  return (
    <div>
      {confirmDelete && (
        <ConfirmModal
          message="Delete this match? All stats from this match will be removed."
          onConfirm={confirmDeleteMatch}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Filters */}
      <div className="card" style={{ paddingBlock: 14 }}>
        <div className="filter-bar">
          <select value={filterPlayer} onChange={e => setFilterPlayer(e.target.value)}>
            <option value="">All Players</option>
            {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="all">All Types</option>
            <option value="singles">Singles</option>
            <option value="doubles">Doubles</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <div className="icon">📋</div>
          <p>{matches.length === 0 ? 'No matches recorded yet.' : 'No matches match your filters.'}</p>
        </div>
      ) : (
        <div className="card">
          <h2>Match History ({filtered.length})</h2>
          {filtered.map(m => {
            const t1sets = m.sets.filter(s => s[0] > s[1]).length
            const t1won = t1sets >= 2
            const isExpanded = expandedMatch === m.id
            const comments = m.comments || []
            return (
              <div key={m.id} className="match-card">
                <div className="match-header">
                  <span className="match-date">{new Date(m.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  <div className="match-actions">
                    <button className="btn btn-sm" style={{ background: 'var(--border-light)', color: 'var(--text-secondary)', fontSize: 12 }}
                      onClick={() => setExpandedMatch(isExpanded ? null : m.id)}>
                      💬 {comments.length || ''}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(m.id)}>🗑</button>
                  </div>
                </div>
                <div className="match-teams">
                  <div className={`match-team ${t1won ? 'winner' : ''}`}>
                    <div className="match-team-names">{m.team1.map(getName).join(' & ')}</div>
                    {t1won && <span style={{ fontSize: 11, color: 'var(--success)' }}>WIN</span>}
                  </div>
                  <div className="match-score-display">
                    {m.sets.map((s, i) => (
                      <div key={i} className={`set-score-badge ${s[0] > s[1] ? 'won' : ''}`}>
                        {s[0]}-{s[1]}
                      </div>
                    ))}
                  </div>
                  <div className={`match-team ${!t1won ? 'winner' : ''}`}>
                    <div className="match-team-names">{m.team2.map(getName).join(' & ')}</div>
                    {!t1won && <span style={{ fontSize: 11, color: 'var(--success)' }}>WIN</span>}
                  </div>
                </div>

                {isExpanded && (
                  <div className="comments-section">
                    {comments.length > 0 && (
                      <div className="comments-list">
                        {comments.map((c, i) => (
                          <div key={i} className="comment">
                            <span className="comment-author">{c.author}</span>
                            <span className="comment-text">{c.text}</span>
                            <span className="comment-time">{new Date(c.time).toLocaleDateString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="comment-form">
                      <input placeholder="Your name" value={commentAuthor} onChange={e => setCommentAuthor(e.target.value)}
                        style={{ width: 100, flexShrink: 0 }} />
                      <input placeholder="Add a comment..." value={commentText} onChange={e => setCommentText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') addComment(m.id) }} style={{ flex: 1 }} />
                      <button className="btn btn-primary btn-sm" onClick={() => addComment(m.id)}>Post</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatsTab({ players, matches }) {
  if (matches.length === 0) {
    return (
      <div className="empty-state">
        <div className="icon">📊</div>
        <p>Play some matches to see statistics!</p>
      </div>
    )
  }

  const getName = id => players.find(p => p.id === id)?.name || 'Unknown'
  const sortedMatches = [...matches].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  // --- ELO ---
  const { elo } = calcElo(players, matches)

  // --- Player stats ---
  const playerStats = players.map(p => {
    let wins = 0, losses = 0, setsWon = 0, setsLost = 0, gamesWon = 0, gamesLost = 0, totalSetsPlayed = 0
    matches.forEach(m => {
      const r = getPlayerResult(m, p.id)
      if (!r) return
      if (r.won) wins++; else losses++
      const t1sets = m.sets.filter(s => s[0] > s[1]).length
      const t2sets = m.sets.filter(s => s[1] > s[0]).length
      totalSetsPlayed += m.sets.length
      if (r.onTeam1) {
        setsWon += t1sets; setsLost += t2sets
        m.sets.forEach(s => { gamesWon += s[0]; gamesLost += s[1] })
      } else {
        setsWon += t2sets; setsLost += t1sets
        m.sets.forEach(s => { gamesWon += s[1]; gamesLost += s[0] })
      }
    })
    const total = wins + losses
    const avgGamesPerSet = totalSetsPlayed > 0 ? ((gamesWon + gamesLost) / totalSetsPlayed) : 0
    return {
      ...p, wins, losses, total, setsWon, setsLost, gamesWon, gamesLost, totalSetsPlayed, avgGamesPerSet,
      winRate: total > 0 ? (wins / total * 100) : 0,
      eloRating: Math.round(elo[p.id] || 1200),
    }
  }).filter(p => p.total > 0).sort((a, b) => b.eloRating - a.eloRating)

  const totalGames = matches.reduce((sum, m) => sum + m.sets.reduce((ss, s) => ss + s[0] + s[1], 0), 0)

  // --- Win streaks ---
  const streakData = players.map(p => {
    let current = 0, longest = 0, currentType = null
    sortedMatches.forEach(m => {
      const r = getPlayerResult(m, p.id)
      if (!r) return
      if (r.won) {
        if (currentType === 'w') current++
        else { current = 1; currentType = 'w' }
      } else {
        if (currentType === 'l') current++
        else { current = 1; currentType = 'l' }
      }
      if (currentType === 'w' && current > longest) longest = current
    })
    return { ...p, currentStreak: current, currentType, longestWinStreak: longest }
  }).filter(p => playerStats.find(s => s.id === p.id))

  const hotStreaks = [...streakData].filter(p => p.currentType === 'w').sort((a, b) => b.currentStreak - a.currentStreak)
  const coldStreaks = [...streakData].filter(p => p.currentType === 'l').sort((a, b) => b.currentStreak - a.currentStreak)
  const longestStreaks = [...streakData].sort((a, b) => b.longestWinStreak - a.longestWinStreak).filter(p => p.longestWinStreak > 0)

  // --- Recent form ---
  const recentForm = players.map(p => {
    const playerMatches = sortedMatches.filter(m => getPlayerResult(m, p.id)).slice(-5)
    const results = playerMatches.map(m => getPlayerResult(m, p.id).won)
    const recentWins = results.filter(Boolean).length
    return { ...p, results, recentWins, recentTotal: results.length, recentRate: results.length > 0 ? (recentWins / results.length * 100) : 0 }
  }).filter(p => p.recentTotal > 0).sort((a, b) => b.recentRate - a.recentRate || b.recentWins - a.recentWins)

  // --- Head-to-head ---
  const h2h = {}
  matches.forEach(m => {
    if (m.team1.length !== 1 || m.team2.length !== 1) return
    const p1 = m.team1[0], p2 = m.team2[0]
    const key = [p1, p2].sort().join('_')
    if (!h2h[key]) h2h[key] = { p1: [p1, p2].sort()[0], p2: [p1, p2].sort()[1], wins: {}, total: 0 }
    const t1won = m.sets.filter(s => s[0] > s[1]).length >= 2
    const winner = t1won ? p1 : p2
    h2h[key].wins[winner] = (h2h[key].wins[winner] || 0) + 1
    h2h[key].total++
  })
  const h2hList = Object.values(h2h).filter(h => h.total > 0).sort((a, b) => b.total - a.total)

  // --- Partnerships ---
  const partnerships = {}
  matches.forEach(m => {
    const t1won = m.sets.filter(s => s[0] > s[1]).length >= 2
    ;[m.team1, m.team2].forEach((team, ti) => {
      if (team.length !== 2) return
      const key = [...team].sort().join('_')
      if (!partnerships[key]) partnerships[key] = { p1: [...team].sort()[0], p2: [...team].sort()[1], wins: 0, losses: 0 }
      const teamWon = (ti === 0 && t1won) || (ti === 1 && !t1won)
      if (teamWon) partnerships[key].wins++
      else partnerships[key].losses++
    })
  })
  const partnerList = Object.values(partnerships)
    .map(p => ({ ...p, total: p.wins + p.losses, winRate: (p.wins / (p.wins + p.losses)) * 100 }))
    .filter(p => p.total > 0)
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins)

  // --- Comebacks ---
  const comebacks = {}
  matches.forEach(m => {
    if (m.sets.length < 3) return
    const set1winner = m.sets[0][0] > m.sets[0][1] ? 1 : 2
    const matchWinner = m.sets.filter(s => s[0] > s[1]).length >= 2 ? 1 : 2
    if (set1winner === matchWinner) return
    const winnerTeam = matchWinner === 1 ? m.team1 : m.team2
    winnerTeam.forEach(pid => { comebacks[pid] = (comebacks[pid] || 0) + 1 })
  })
  const comebackList = Object.entries(comebacks)
    .map(([id, count]) => ({ id, name: getName(id), count, player: players.find(p => p.id === id) }))
    .filter(c => c.player)
    .sort((a, b) => b.count - a.count)

  // --- Most dominant & closest matches ---
  const matchDetails = matches.map(m => {
    const totalGames = m.sets.reduce((s, set) => s + set[0] + set[1], 0)
    const t1games = m.sets.reduce((s, set) => s + set[0], 0)
    const t2games = m.sets.reduce((s, set) => s + set[1], 0)
    const margin = Math.abs(t1games - t2games)
    const t1won = m.sets.filter(s => s[0] > s[1]).length >= 2
    return { ...m, totalGames, t1games, t2games, margin, t1won }
  })
  const mostDominant = [...matchDetails].sort((a, b) => b.margin - a.margin).slice(0, 3)
  const closestMatches = [...matchDetails].sort((a, b) => a.margin - b.margin || b.totalGames - a.totalGames).slice(0, 3)

  return (
    <>
      {/* Overview */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{matches.length}</div>
          <div className="stat-label">Matches Played</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{matches.reduce((s, m) => s + m.sets.length, 0)}</div>
          <div className="stat-label">Total Sets</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalGames}</div>
          <div className="stat-label">Total Games</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{players.length}</div>
          <div className="stat-label">Players</div>
        </div>
      </div>

      {/* ELO Leaderboard */}
      <div className="card">
        <h2>ELO Rankings</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Ratings start at 1200. Beating higher-rated opponents gains more points.</p>
        {playerStats.map((p, i) => (
          <div key={p.id} className="leaderboard-row">
            <div className={`leaderboard-rank ${i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : ''}`}>
              {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
            </div>
            <Avatar player={p} size={36} />
            <div className="leaderboard-info">
              <div className="leaderboard-name">{p.name}</div>
              <div className="leaderboard-record">
                {p.wins}W - {p.losses}L · Win rate: {p.winRate.toFixed(0)}% · Sets: {p.setsWon}-{p.setsLost}
              </div>
            </div>
            <div className="leaderboard-winrate" style={{ fontSize: 18 }}>{p.eloRating}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <EloChart players={players} matches={matches} />
      <WinRateChart players={players} matches={matches} />

      {/* Avg games per set */}
      <div className="card">
        <h2>Average Games Per Set</h2>
        {[...playerStats].sort((a, b) => b.avgGamesPerSet - a.avgGamesPerSet).map(p => (
          <div key={p.id} className="leaderboard-row">
            <Avatar player={p} size={28} />
            <div className="leaderboard-info">
              <div className="leaderboard-name">{p.name}</div>
              <div className="leaderboard-record">{p.totalSetsPlayed} sets played · {p.gamesWon} won / {p.gamesLost} lost</div>
            </div>
            <div className="leaderboard-winrate" style={{ fontSize: 16, color: 'var(--text)' }}>{p.avgGamesPerSet.toFixed(1)}</div>
          </div>
        ))}
      </div>

      {/* Most Dominant */}
      <div className="card">
        <h2>Most Dominant Victories 💪</h2>
        {mostDominant.map(m => (
          <div key={m.id} className="match-card" style={{ marginBottom: 8 }}>
            <div className="match-teams">
              <div className={`match-team ${m.t1won ? 'winner' : ''}`}>
                <div className="match-team-names">{m.team1.map(getName).join(' & ')}</div>
              </div>
              <div className="match-score-display">
                {m.sets.map((s, i) => (
                  <div key={i} className={`set-score-badge ${s[0] > s[1] ? 'won' : ''}`}>{s[0]}-{s[1]}</div>
                ))}
              </div>
              <div className={`match-team ${!m.t1won ? 'winner' : ''}`}>
                <div className="match-team-names">{m.team2.map(getName).join(' & ')}</div>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Margin: {m.margin} games · {new Date(m.date).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      {/* Closest Matches */}
      <div className="card">
        <h2>Closest Matches 🔥</h2>
        {closestMatches.map(m => (
          <div key={m.id} className="match-card" style={{ marginBottom: 8 }}>
            <div className="match-teams">
              <div className={`match-team ${m.t1won ? 'winner' : ''}`}>
                <div className="match-team-names">{m.team1.map(getName).join(' & ')}</div>
              </div>
              <div className="match-score-display">
                {m.sets.map((s, i) => (
                  <div key={i} className={`set-score-badge ${s[0] > s[1] ? 'won' : ''}`}>{s[0]}-{s[1]}</div>
                ))}
              </div>
              <div className={`match-team ${!m.t1won ? 'winner' : ''}`}>
                <div className="match-team-names">{m.team2.map(getName).join(' & ')}</div>
              </div>
            </div>
            <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              {m.totalGames} total games · Margin: {m.margin} · {new Date(m.date).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Form */}
      <div className="card">
        <h2>Recent Form (Last 5)</h2>
        {recentForm.map(p => (
          <div key={p.id} className="leaderboard-row">
            <Avatar player={p} size={32} />
            <div className="leaderboard-info">
              <div className="leaderboard-name">{p.name}</div>
              <div className="form-dots">
                {p.results.map((won, i) => (
                  <span key={i} className={`form-dot ${won ? 'win' : 'loss'}`}>{won ? 'W' : 'L'}</span>
                ))}
              </div>
            </div>
            <div className="leaderboard-winrate" style={{ color: p.recentRate >= 60 ? 'var(--success)' : p.recentRate <= 40 ? 'var(--danger)' : 'var(--text-secondary)' }}>
              {p.recentRate.toFixed(0)}%
            </div>
          </div>
        ))}
      </div>

      {/* Win Streaks */}
      <div className="card">
        <h2>Win Streaks</h2>
        <div className="streak-section">
          {hotStreaks.length > 0 && (
            <div className="streak-group">
              <h3 className="streak-subtitle">🔥 Current Hot Streaks</h3>
              {hotStreaks.map(p => (
                <div key={p.id} className="streak-row">
                  <Avatar player={p} size={28} />
                  <span className="streak-name">{p.name}</span>
                  <span className="streak-badge hot">{p.currentStreak}W</span>
                </div>
              ))}
            </div>
          )}
          {coldStreaks.length > 0 && (
            <div className="streak-group">
              <h3 className="streak-subtitle">🥶 Current Cold Streaks</h3>
              {coldStreaks.map(p => (
                <div key={p.id} className="streak-row">
                  <Avatar player={p} size={28} />
                  <span className="streak-name">{p.name}</span>
                  <span className="streak-badge cold">{p.currentStreak}L</span>
                </div>
              ))}
            </div>
          )}
          {longestStreaks.length > 0 && (
            <div className="streak-group">
              <h3 className="streak-subtitle">👑 All-Time Best Win Streaks</h3>
              {longestStreaks.map(p => (
                <div key={p.id} className="streak-row">
                  <Avatar player={p} size={28} />
                  <span className="streak-name">{p.name}</span>
                  <span className="streak-badge">{p.longestWinStreak}W</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Head-to-Head */}
      {h2hList.length > 0 && (
        <div className="card">
          <h2>Head-to-Head (Singles)</h2>
          {h2hList.map(h => {
            const w1 = h.wins[h.p1] || 0
            const w2 = h.wins[h.p2] || 0
            const p1 = players.find(p => p.id === h.p1)
            const p2 = players.find(p => p.id === h.p2)
            if (!p1 || !p2) return null
            const pct1 = (w1 / h.total) * 100
            return (
              <div key={`${h.p1}_${h.p2}`} className="h2h-row">
                <div className="h2h-player">
                  <Avatar player={p1} size={28} />
                  <span className={w1 > w2 ? 'h2h-leader' : ''}>{p1.name}</span>
                </div>
                <div className="h2h-score">
                  <div className="h2h-bar">
                    <div className="h2h-bar-fill left" style={{ width: `${pct1}%` }} />
                    <div className="h2h-bar-fill right" style={{ width: `${100 - pct1}%` }} />
                  </div>
                  <span className="h2h-record">{w1} - {w2}</span>
                </div>
                <div className="h2h-player right">
                  <span className={w2 > w1 ? 'h2h-leader' : ''}>{p2.name}</span>
                  <Avatar player={p2} size={28} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Partnerships */}
      {partnerList.length > 0 && (
        <div className="card">
          <h2>Best Partnerships (Doubles)</h2>
          {partnerList.map((p, i) => {
            const p1 = players.find(pl => pl.id === p.p1)
            const p2 = players.find(pl => pl.id === p.p2)
            if (!p1 || !p2) return null
            return (
              <div key={`${p.p1}_${p.p2}`} className="partnership-row">
                <div className="partnership-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</div>
                <div className="partnership-avatars">
                  <Avatar player={p1} size={28} />
                  <Avatar player={p2} size={28} />
                </div>
                <div className="partnership-info">
                  <div className="partnership-names">{p1.name} & {p2.name}</div>
                  <div className="partnership-record">{p.wins}W - {p.losses}L</div>
                </div>
                <div className="leaderboard-winrate" style={{ fontSize: 18 }}>{p.winRate.toFixed(0)}%</div>
              </div>
            )
          })}
        </div>
      )}

      {/* Comebacks */}
      {comebackList.length > 0 && (
        <div className="card">
          <h2>Comeback Kings 👊</h2>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Won the match after losing Set 1</p>
          {comebackList.map(c => (
            <div key={c.id} className="streak-row">
              <Avatar player={c.player} size={28} />
              <span className="streak-name">{c.name}</span>
              <span className="streak-badge hot">{c.count} comeback{c.count !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default App
