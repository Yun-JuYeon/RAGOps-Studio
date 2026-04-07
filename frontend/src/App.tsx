import { Navigate, Route, Routes } from "react-router-dom";

import Layout from "./components/Layout";
import ChatPage from "./pages/Chat";
import DocumentsPage from "./pages/Documents";
import EvalPage from "./pages/Eval";
import IndexDetailPage from "./pages/IndexDetail";
import IndicesPage from "./pages/Indices";
import SearchPage from "./pages/Search";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/indices" replace />} />
        <Route path="/indices" element={<IndicesPage />} />
        <Route path="/indices/:name" element={<IndexDetailPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/eval" element={<EvalPage />} />
      </Route>
    </Routes>
  );
}
