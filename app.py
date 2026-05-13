from flask import Flask, render_template, request, jsonify, send_from_directory
import sqlite3
import json
import os
from datetime import datetime, date, timedelta

app = Flask(__name__)
DATABASE = os.path.join(os.path.dirname(__file__), 'database', 'liftlog.db')

def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs(os.path.dirname(DATABASE), exist_ok=True)
    conn = get_db()
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS profile (
        id INTEGER PRIMARY KEY,
        name TEXT, age INTEGER, height REAL, weight REAL, goal TEXT
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT, notes TEXT, weekdays TEXT, created_at TEXT
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS exercises (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER, name TEXT, sets INTEGER, reps INTEGER, weight REAL,
        FOREIGN KEY(plan_id) REFERENCES plans(id)
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plan_id INTEGER, date TEXT, completed INTEGER DEFAULT 0, duration INTEGER DEFAULT 0
    )''')
    c.execute('''CREATE TABLE IF NOT EXISTS set_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER, exercise_id INTEGER, set_num INTEGER,
        reps INTEGER, weight REAL, completed INTEGER DEFAULT 0,
        FOREIGN KEY(session_id) REFERENCES sessions(id)
    )''')
    conn.commit()
    conn.close()

# ── Routes ──────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json')

@app.route('/sw.js')
def service_worker():
    return send_from_directory('static', 'sw.js')

# ── Profile ──────────────────────────────────────────────
@app.route('/api/profile', methods=['GET', 'POST'])
def profile():
    conn = get_db()
    if request.method == 'POST':
        d = request.json
        conn.execute('DELETE FROM profile')
        conn.execute('INSERT INTO profile (id,name,age,height,weight,goal) VALUES (1,?,?,?,?,?)',
                     (d.get('name'), d.get('age'), d.get('height'), d.get('weight'), d.get('goal')))
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})
    row = conn.execute('SELECT * FROM profile WHERE id=1').fetchone()
    conn.close()
    return jsonify(dict(row) if row else {})

# ── Plans ──────────────────────────────────────────────
@app.route('/api/plans', methods=['GET', 'POST'])
def plans():
    conn = get_db()
    if request.method == 'POST':
        d = request.json
        cur = conn.execute(
            'INSERT INTO plans (name, notes, weekdays, created_at) VALUES (?,?,?,?)',
            (d['name'], d.get('notes',''), json.dumps(d.get('weekdays',[])), datetime.now().isoformat())
        )
        plan_id = cur.lastrowid
        for ex in d.get('exercises', []):
            conn.execute('INSERT INTO exercises (plan_id,name,sets,reps,weight) VALUES (?,?,?,?,?)',
                         (plan_id, ex['name'], ex.get('sets',3), ex.get('reps',10), ex.get('weight',0)))
        conn.commit()
        conn.close()
        return jsonify({'id': plan_id, 'status': 'ok'})
    rows = conn.execute('SELECT * FROM plans ORDER BY id DESC').fetchall()
    plans_list = []
    for r in rows:
        p = dict(r)
        p['weekdays'] = json.loads(p['weekdays'])
        exs = conn.execute('SELECT * FROM exercises WHERE plan_id=?', (p['id'],)).fetchall()
        p['exercises'] = [dict(e) for e in exs]
        plans_list.append(p)
    conn.close()
    return jsonify(plans_list)

@app.route('/api/plans/<int:plan_id>', methods=['GET', 'PUT', 'DELETE'])
def plan_detail(plan_id):
    conn = get_db()
    if request.method == 'DELETE':
        conn.execute('DELETE FROM exercises WHERE plan_id=?', (plan_id,))
        conn.execute('DELETE FROM plans WHERE id=?', (plan_id,))
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})
    if request.method == 'PUT':
        d = request.json
        conn.execute('UPDATE plans SET name=?, notes=?, weekdays=? WHERE id=?',
                     (d['name'], d.get('notes',''), json.dumps(d.get('weekdays',[])), plan_id))
        conn.execute('DELETE FROM exercises WHERE plan_id=?', (plan_id,))
        for ex in d.get('exercises', []):
            conn.execute('INSERT INTO exercises (plan_id,name,sets,reps,weight) VALUES (?,?,?,?,?)',
                         (plan_id, ex['name'], ex.get('sets',3), ex.get('reps',10), ex.get('weight',0)))
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})
    row = conn.execute('SELECT * FROM plans WHERE id=?', (plan_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    p = dict(row)
    p['weekdays'] = json.loads(p['weekdays'])
    exs = conn.execute('SELECT * FROM exercises WHERE plan_id=?', (plan_id,)).fetchall()
    p['exercises'] = [dict(e) for e in exs]
    conn.close()
    return jsonify(p)

# ── Sessions ──────────────────────────────────────────────
@app.route('/api/sessions', methods=['GET', 'POST'])
def sessions():
    conn = get_db()
    if request.method == 'POST':
        d = request.json
        today = date.today().isoformat()
        existing = conn.execute('SELECT id FROM sessions WHERE plan_id=? AND date=?',
                                (d['plan_id'], today)).fetchone()
        if existing:
            conn.close()
            return jsonify({'id': existing['id'], 'status': 'existing'})
        cur = conn.execute('INSERT INTO sessions (plan_id, date) VALUES (?,?)', (d['plan_id'], today))
        session_id = cur.lastrowid
        conn.commit()
        conn.close()
        return jsonify({'id': session_id, 'status': 'created'})
    rows = conn.execute('SELECT s.*, p.name as plan_name FROM sessions s LEFT JOIN plans p ON s.plan_id=p.id ORDER BY s.date DESC').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/sessions/<int:session_id>', methods=['GET', 'PUT'])
def session_detail(session_id):
    conn = get_db()
    if request.method == 'PUT':
        d = request.json
        conn.execute('UPDATE sessions SET completed=?, duration=? WHERE id=?',
                     (d.get('completed', 0), d.get('duration', 0), session_id))
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})
    row = conn.execute('SELECT * FROM sessions WHERE id=?', (session_id,)).fetchone()
    if not row:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    s = dict(row)
    logs = conn.execute('SELECT * FROM set_logs WHERE session_id=?', (session_id,)).fetchall()
    s['logs'] = [dict(l) for l in logs]
    conn.close()
    return jsonify(s)

@app.route('/api/set_logs', methods=['POST', 'PUT'])
def set_logs():
    conn = get_db()
    d = request.json
    if request.method == 'PUT':
        conn.execute('UPDATE set_logs SET reps=?, weight=?, completed=? WHERE id=?',
                     (d['reps'], d['weight'], d['completed'], d['id']))
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})
    existing = conn.execute(
        'SELECT id FROM set_logs WHERE session_id=? AND exercise_id=? AND set_num=?',
        (d['session_id'], d['exercise_id'], d['set_num'])
    ).fetchone()
    if existing:
        conn.execute('UPDATE set_logs SET reps=?, weight=?, completed=? WHERE id=?',
                     (d['reps'], d['weight'], d.get('completed', 0), existing['id']))
        log_id = existing['id']
    else:
        cur = conn.execute(
            'INSERT INTO set_logs (session_id, exercise_id, set_num, reps, weight, completed) VALUES (?,?,?,?,?,?)',
            (d['session_id'], d['exercise_id'], d['set_num'], d['reps'], d['weight'], d.get('completed', 0))
        )
        log_id = cur.lastrowid
    conn.commit()
    conn.close()
    return jsonify({'id': log_id, 'status': 'ok'})

# ── Stats ──────────────────────────────────────────────
@app.route('/api/stats')
def stats():
    conn = get_db()
    total = conn.execute('SELECT COUNT(*) as c FROM sessions WHERE completed=1').fetchone()['c']
    # Weekly streak
    today = date.today()
    streak = 0
    check = today
    while True:
        row = conn.execute('SELECT id FROM sessions WHERE date=? AND completed=1',
                           (check.isoformat(),)).fetchone()
        if row:
            streak += 1
            check -= timedelta(days=1)
        else:
            break
    # This week completions
    week_start = today - timedelta(days=today.weekday())
    week_sessions = conn.execute(
        'SELECT date FROM sessions WHERE date>=? AND completed=1',
        (week_start.isoformat(),)
    ).fetchall()
    week_dates = [r['date'] for r in week_sessions]
    # PRs per exercise
    prs = conn.execute('''
        SELECT e.name, MAX(sl.weight) as pr_weight, MAX(sl.reps) as pr_reps
        FROM set_logs sl JOIN exercises e ON sl.exercise_id=e.id
        WHERE sl.completed=1
        GROUP BY e.name ORDER BY pr_weight DESC LIMIT 10
    ''').fetchall()
    # Last 8 weeks completion
    history = []
    for i in range(7, -1, -1):
        wstart = today - timedelta(days=today.weekday() + 7*i)
        wend = wstart + timedelta(days=6)
        cnt = conn.execute('SELECT COUNT(*) as c FROM sessions WHERE date>=? AND date<=? AND completed=1',
                           (wstart.isoformat(), wend.isoformat())).fetchone()['c']
        history.append({'week': wstart.strftime('%b %d'), 'count': cnt})
    conn.close()
    return jsonify({
        'total_sessions': total,
        'streak': streak,
        'week_dates': week_dates,
        'prs': [dict(p) for p in prs],
        'history': history
    })

# ── Reset ──────────────────────────────────────────────
@app.route('/api/reset', methods=['POST'])
def reset():
    conn = get_db()
    conn.execute('DELETE FROM set_logs')
    conn.execute('DELETE FROM sessions')
    conn.execute('DELETE FROM exercises')
    conn.execute('DELETE FROM plans')
    conn.execute('DELETE FROM profile')
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok'})

@app.route('/api/export')
def export_data():
    conn = get_db()
    data = {
        'profile': [dict(r) for r in conn.execute('SELECT * FROM profile').fetchall()],
        'plans': [dict(r) for r in conn.execute('SELECT * FROM plans').fetchall()],
        'exercises': [dict(r) for r in conn.execute('SELECT * FROM exercises').fetchall()],
        'sessions': [dict(r) for r in conn.execute('SELECT * FROM sessions').fetchall()],
        'set_logs': [dict(r) for r in conn.execute('SELECT * FROM set_logs').fetchall()],
    }
    conn.close()
    return jsonify(data)

if __name__ == '__main__':
    init_db()
    app.run(host="0.0.0.0", port=5050, debug=True)
