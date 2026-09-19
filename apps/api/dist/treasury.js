export async function treasuryContext(pool, snapshot) {
    if (!snapshot)
        return null;
    const entity = String(snapshot.opale_entity || snapshot.source_key || '');
    if (!entity)
        return null;
    const rows = (await pool.query(`select period,period_date,journal,debit,credit,movement,movement_kind from accounting_lines where opale_entity=$1 and account like '5151%' order by period_date,journal`, [entity])).rows;
    if (!rows.length)
        return null;
    const byExercise = new Map();
    for (const r of rows) {
        const rawDate = r.period_date instanceof Date ? r.period_date.toISOString().slice(0, 10) : String(r.period_date).slice(0, 10), exercise = Number(rawDate.slice(0, 4)), monthNo = Number(rawDate.slice(5, 7));
        if (!exercise || !monthNo)
            continue;
        if (!byExercise.has(exercise))
            byExercise.set(exercise, new Map());
        const months = byExercise.get(exercise);
        const key = `${exercise}-${String(monthNo).padStart(2, '0')}`;
        const x = months.get(key) || { period: key, exercise, month: monthNo, debit: 0, credit: 0, movement: 0, opening: 0 };
        const debit = Number(r.debit), credit = Number(r.credit), movement = debit - credit;
        if (String(r.journal || '').trim().toUpperCase() === 'ZOUVER' || r.movement_kind === 'OPENING')
            x.opening += movement;
        else {
            x.debit += debit;
            x.credit += credit;
            x.movement += movement;
        }
        months.set(key, x);
    }
    const series = [...byExercise.entries()].sort(([a], [b]) => a - b).map(([exercise, months]) => {
        const points = [...months.values()].sort((a, b) => a.month - b.month);
        const opening = points.reduce((sum, x) => sum + x.opening, 0);
        let balance = opening;
        for (const x of points) {
            balance += x.movement;
            x.balance = balance;
        }
        return { exercise, openingBalance: opening, history: points, currentBalance: points.at(-1)?.balance ?? opening, minBalance: points.length ? Math.min(...points.map(x => x.balance)) : opening, maxBalance: points.length ? Math.max(...points.map(x => x.balance)) : opening };
    });
    const currentSeries = series.at(-1) || null, current = currentSeries?.history.at(-1) || null, previous = currentSeries?.history.at(-2) || null, signals = [];
    if (current && current.balance < 0)
        signals.push({ code: 'TRE-NEG', level: 'alert', domain: 'Trésorerie', processCode: 'TRE', title: 'Solde comptable 5151 négatif', detail: `Le solde comptable reconstitué ressort à ${current.balance.toFixed(2)} €.`, amount: current.balance, source: 'Mouvements 5151 Op@le', condition: 'Solde reconstitué < 0 €', interpretation: 'Signal comptable à examiner ; il ne constitue pas un solde bancaire temps réel.' });
    if (current && previous && previous.balance > 0 && current.balance < previous.balance * .7)
        signals.push({ code: 'TRE-DOWN', level: 'watch', domain: 'Trésorerie', processCode: 'TRE', title: 'Baisse mensuelle marquée de trésorerie', detail: `Le solde reconstitué baisse de ${((current.balance / previous.balance - 1) * 100).toFixed(1)} % sur un mois.`, amount: current.balance - previous.balance, source: 'Mouvements 5151 Op@le', condition: 'Baisse mensuelle > 30 %', interpretation: 'Variation à contextualiser avec les encaissements et décaissements attendus.' });
    return { account: '5151', sourceFormat: snapshot.source_format || 'opale-accounting-monthly-summary', snapshotDate: snapshot.period_to, currentExercise: currentSeries?.exercise ?? null, openingBalance: currentSeries?.openingBalance ?? null, currentBalance: currentSeries?.currentBalance ?? null, currentMovement: current?.movement ?? null, minBalance: currentSeries?.minBalance ?? null, maxBalance: currentSeries?.maxBalance ?? null, history: currentSeries?.history || [], series, signals, warning: 'Solde comptable reconstitué par exercice : ZOUVER fixe le solde au 1er janvier ; les autres écritures font varier le 5151 au débit (+) et au crédit (−).' };
}
