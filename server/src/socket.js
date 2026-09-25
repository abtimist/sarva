const db = require("./db");

let teacherSocketId = null;
const studentSockets = new Set();
const socketSessionMap = new Map();

function setupSocket(io, getCurrentSessionId) {
  io.on("connection", (socket) => {
    const clientType = socket.handshake.query.type;

    if (clientType === "student") {
      studentSockets.add(socket.id);
      io.emit("student-count", studentSockets.size);

      socket.on("join-session", (sessionId) => {
        const sid = parseInt(sessionId) || getCurrentSessionId();
        if (!sid) return;

        const prevRoom = socketSessionMap.get(socket.id);
        if (prevRoom) socket.leave("session:" + prevRoom);

        socketSessionMap.set(socket.id, sid);
        socket.join("session:" + sid);

        const notes = db.prepare(
          "SELECT id, session_id, title, content, created_at, updated_at FROM notes WHERE session_id = ? ORDER BY created_at ASC"
        ).all(sid);
        socket.emit("session-notes", { sessionId: sid, notes });
      });
    } else {
      teacherSocketId = socket.id;
      const sessionId = getCurrentSessionId();
      if (sessionId) {
        socket.join("session:" + sessionId);
      }
    }

    socket.on("disconnect", () => {
      if (studentSockets.has(socket.id)) {
        studentSockets.delete(socket.id);
        socketSessionMap.delete(socket.id);
        io.emit("student-count", studentSockets.size);
      }
      if (teacherSocketId === socket.id) teacherSocketId = null;
    });
  });
}

function getTeacherSocketId() {
  return teacherSocketId;
}

function getStudentCount() {
  return studentSockets.size;
}

module.exports = { setupSocket, getTeacherSocketId, getStudentCount };
