import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './context/SocketContext';
import { GameProvider } from './context/GameContext';
import HostSetup from './pages/HostSetup';
import HostDashboard from './pages/HostDashboard';
import GuestJoin from './pages/GuestJoin';
import GuestView from './pages/GuestView';

export default function App() {
  return (
    <BrowserRouter>
      <SocketProvider>
        <GameProvider>
          <Routes>
            <Route path="/" element={<Navigate to="/host" replace />} />
            <Route path="/host" element={<HostSetup />} />
            <Route path="/host/:sessionId" element={<HostDashboard />} />
            <Route path="/join/:sessionId" element={<GuestJoin />} />
            <Route path="/guest/:sessionId" element={<GuestView />} />
          </Routes>
        </GameProvider>
      </SocketProvider>
    </BrowserRouter>
  );
}