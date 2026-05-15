const express = require('express');
const cors = require('cors');
const path = require('path');
const supabase = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

// Serve the frontend static files so they are available on localhost:3000!
app.use(express.static(path.join(__dirname, '../client')));

// Helper function to generate time slots from 09:00 to 17:00
function generateTimeSlots(dateStr) {
    const slots = [];
    let startHour = 9;
    let endHour = 17;
    
    for (let h = startHour; h < endHour; h++) {
        for (let m = 0; m < 60; m += 30) {
            const hour = h.toString().padStart(2, '0');
            const minute = m.toString().padStart(2, '0');
            slots.push(`${dateStr}T${hour}:${minute}:00`);
        }
    }
    return slots;
}

// GET /api/slots?date=YYYY-MM-DD
app.get('/api/slots', async (req, res) => {
    const dateStr = req.query.date;
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return res.status(400).json({ error: 'Valid date required (YYYY-MM-DD)' });
    }

    const allSlotsForDate = generateTimeSlots(dateStr);
    const startStr = `${dateStr}T00:00:00`;
    const endStr = `${dateStr}T23:59:59`;

    const { data, error } = await supabase
        .from('slots')
        .select('slot_time, is_booked')
        .gte('slot_time', startStr)
        .lte('slot_time', endStr);

    if (error) {
        console.error('Supabase fetch error:', error);
        return res.status(500).json({ error: 'Database fetch error' });
    }

    const bookedMap = {};
    if (data) {
        data.forEach(row => {
            // Normalize "2026-05-15T09:30:00+00:00" to "2026-05-15T09:30:00"
            const isoKey = new Date(row.slot_time).toISOString().substring(0, 19);
            bookedMap[isoKey] = row.is_booked;
        });
        console.log(`Found ${data.length} booked slots for ${dateStr}`);
    }

    const result = allSlotsForDate.map(slot => ({
        slot_time: slot,
        is_booked: !!bookedMap[slot]
    }));

    res.json({ slots: result });
});

// POST /api/slots/book
app.post('/api/slots/book', async (req, res) => {
    const { slot_times } = req.body;
    
    if (!slot_times || !Array.isArray(slot_times) || slot_times.length === 0) {
        return res.status(400).json({ error: 'slot_times array is required' });
    }

    // 1. Validate if any are already booked
    const { data: existing, error: fetchErr } = await supabase
        .from('slots')
        .select('slot_time, is_booked')
        .in('slot_time', slot_times);

    if (fetchErr) {
        console.error('Fetch err', fetchErr)
        return res.status(500).json({ error: 'Database fetch error' });
    }

    // Since we only insert rows when booked, any row returned might be booked
    const bookedSlots = existing ? existing.filter(row => row.is_booked) : [];
    if (bookedSlots.length > 0) {
        return res.status(400).json({ 
            error: 'One or more of the selected slots are already booked.', 
            booked: bookedSlots.map(r => r.slot_time) 
        });
    }

    // 2. Perform bulk insert
    const insertData = slot_times.map(st => ({
        slot_time: st,
        is_booked: true
    }));

    const { error: insertErr } = await supabase
        .from('slots')
        .insert(insertData);

    if (insertErr) {
        console.error('Supabase insert error:', insertErr);
        // Specifically handle duplicate key constraint if someone booked at exact same time
        if (insertErr.code === '23505') {
            return res.status(400).json({ error: 'Race condition! A slot was just taken.' });
        }
        return res.status(500).json({ error: 'Database error during insertion.' });
    }

    res.json({ success: true, message: 'All slots successfully booked via Supabase', slot_times });
});

// Export the express app so Vercel can run it as a serverless function!
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server is running heavily on http://localhost:${PORT}`);
    });
}

module.exports = app;
