const statusEl = document.getElementById('status')!

async function checkStatus() {
  try {
    const ws = new WebSocket('ws://localhost:3456')
    ws.onopen = () => {
      statusEl.textContent = 'Connected to brow-use server'
      statusEl.className = 'connected'
      ws.close()
    }
    ws.onerror = () => {
      statusEl.textContent = 'Server not running'
      statusEl.className = 'disconnected'
    }
  } catch {
    statusEl.textContent = 'Server not running'
    statusEl.className = 'disconnected'
  }
}

checkStatus()
