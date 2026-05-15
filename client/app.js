document.addEventListener('DOMContentLoaded', () => {
    const datePicker = document.getElementById('date-picker');
    const slotsContainer = document.getElementById('slots-container');
    const loader = document.getElementById('loader');
    const statusMessage = document.getElementById('status-message');
    const modal = document.getElementById('booking-modal');
    const cancelBtn = document.getElementById('cancel-btn');
    const confirmBtn = document.getElementById('confirm-btn');
    const modalTimeList = document.getElementById('modal-time-list');
    const actionBar = document.getElementById('action-bar');
    const selectedCountEl = document.getElementById('selected-count');
    const bookSelectedBtn = document.getElementById('book-selected-btn');

    let selectedSlots = []; // Array of slot_time strings
    const API_URL = '/api';

    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    datePicker.value = today;
    datePicker.min = today;

    // Fetch slots on load
    fetchSlots(today);

    // Event Listeners
    datePicker.addEventListener('change', (e) => {
        if (e.target.value) {
            fetchSlots(e.target.value);
        }
    });

    cancelBtn.addEventListener('click', closeModal);
    confirmBtn.addEventListener('click', confirmBookings);
    bookSelectedBtn.addEventListener('click', openModal);

    // Close modal on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Functions
    async function fetchSlots(date) {
        showLoader();
        slotsContainer.innerHTML = '';
        hideStatus();
        selectedSlots = [];
        updateActionBar();

        try {
            const response = await fetch(`${API_URL}/slots?date=${date}`);
            const data = await response.json();
            
            if (response.ok) {
                renderSlots(data.slots);
            } else {
                showStatus(data.error || 'Failed to fetch slots', 'error');
            }
        } catch (error) {
            showStatus('Network error. Is the server running?', 'error');
            console.error('Fetch error:', error);
        } finally {
            hideLoader();
        }
    }

    function renderSlots(slots) {
        slotsContainer.innerHTML = '';
        
        if (!slots || slots.length === 0) {
            slotsContainer.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-secondary);">No slots available for this date.</p>';
            return;
        }

        slots.forEach(slot => {
            const slotEl = document.createElement('div');
            const timeString = formatTime(slot.slot_time);
            
            slotEl.className = `slot ${slot.is_booked ? 'booked' : ''}`;
            slotEl.dataset.rawTime = slot.slot_time;
            slotEl.innerHTML = `
                <span class="time">${timeString}</span>
                <span class="status">${slot.is_booked ? 'Booked' : 'Available'}</span>
            `;

            if (!slot.is_booked) {
                slotEl.addEventListener('click', () => toggleSlotSelection(slotEl, slot.slot_time));
            } else {
                slotEl.title = "This slot is already booked";
            }

            slotsContainer.appendChild(slotEl);
        });
    }

    function toggleSlotSelection(slotEl, rawTime) {
        const index = selectedSlots.indexOf(rawTime);
        if (index > -1) {
            // Already selected, remove it
            selectedSlots.splice(index, 1);
            slotEl.classList.remove('selected');
        } else {
            // Add to selection
            selectedSlots.push(rawTime);
            slotEl.classList.add('selected');
        }
        
        // Sort slots nicely
        selectedSlots.sort();
        updateActionBar();
    }

    function updateActionBar() {
        if (selectedSlots.length > 0) {
            selectedCountEl.textContent = selectedSlots.length;
            actionBar.classList.remove('hidden');
        } else {
            actionBar.classList.add('hidden');
        }
    }

    function openModal() {
        if (selectedSlots.length === 0) return;
        
        // Populate modal list
        modalTimeList.innerHTML = '';
        selectedSlots.forEach(slotTime => {
            const li = document.createElement('li');
            li.textContent = formatTime(slotTime);
            modalTimeList.appendChild(li);
        });
        
        modal.classList.remove('hidden');
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    async function confirmBookings() {
        if (selectedSlots.length === 0) return;

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Booking...';

        try {
            const response = await fetch(`${API_URL}/slots/book`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ slot_times: selectedSlots })
            });

            const data = await response.json();

            if (response.ok) {
                closeModal();
                showStatus(`Successfully booked ${selectedSlots.length} slot(s)!`, 'success');
                // Refresh slots immediately to show it as booked visually
                fetchSlots(datePicker.value);
            } else {
                closeModal();
                // Prevent partial/double booking error response
                showStatus(data.error || 'Failed to book slot(s). Someone might have taken them!', 'error');
                fetchSlots(datePicker.value);
            }
        } catch (error) {
            closeModal();
            showStatus('Network error occurred.', 'error');
        } finally {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm Booking';
        }
    }

    function formatTime(isoString) {
        const date = new Date(isoString);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function showLoader() { loader.classList.remove('hidden'); }
    function hideLoader() { loader.classList.add('hidden'); }
    
    function showStatus(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = `status-message ${type}`;
        statusMessage.classList.remove('hidden');
        
        if (type === 'success') {
            setTimeout(hideStatus, 4000);
        }
    }
    
    function hideStatus() {
        statusMessage.classList.add('hidden');
    }
});
