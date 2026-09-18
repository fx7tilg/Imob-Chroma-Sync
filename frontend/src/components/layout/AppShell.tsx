import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import ChatAssistant from "../ChatAssistant";
import styles from "./layout.module.css";

export default function AppShell() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <main className={styles.main}>
        <Header />
        <div className={styles.content}>
          <div className="page-enter">
            <Outlet />
          </div>
        </div>
      </main>
      <ChatAssistant />
    </div>
  );
}
