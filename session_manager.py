#!/usr/bin/env python3
"""
Session Manager for Aura Vision Assistant

Handles:
- User session creation and management
- Image tracking per session
- Voice session state
"""

import uuid
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List

class SessionManager:
    """Manages user sessions and voice interactions."""
    
    def __init__(self):
        self.sessions = {}
        self.cleanup_interval = timedelta(hours=24)  # Clean up old sessions
    
    def create_session(self, user_id: str, voice_enabled: bool = True) -> str:
        """Create a new user session."""
        session_id = str(uuid.uuid4())
        self.sessions[session_id] = {
            "user_id": user_id,
            "created_at": datetime.now(),
            "last_activity": datetime.now(),
            "images": [],
            "voice_enabled": voice_enabled,
            "current_image": None
        }
        print(f"📱 Created session {session_id} for user {user_id}")
        return session_id
    
    def get_session(self, session_id: str) -> Optional[Dict]:
        """Get session information."""
        return self.sessions.get(session_id)
    
    def update_session_activity(self, session_id: str):
        """Update session last activity."""
        if session_id in self.sessions:
            self.sessions[session_id]["last_activity"] = datetime.now()
    
    def add_image_to_session(self, session_id: str, image_id: str):
        """Add image to session."""
        if session_id in self.sessions:
            self.sessions[session_id]["images"].append(image_id)
            self.sessions[session_id]["current_image"] = image_id
            print(f"📸 Added image {image_id} to session {session_id}")
    
    def get_current_image(self, session_id: str) -> Optional[str]:
        """Get current image for session."""
        session = self.sessions.get(session_id)
        return session.get("current_image") if session else None
    
    def get_session_info(self, session_id: str) -> Optional[Dict]:
        """Get formatted session information."""
        session = self.sessions.get(session_id)
        if not session:
            return None
        
        return {
            "session_id": session_id,
            "user_id": session["user_id"],
            "created_at": session["created_at"].isoformat(),
            "last_activity": session["last_activity"].isoformat(),
            "images": session["images"],
            "current_image": session["current_image"],
            "voice_enabled": session["voice_enabled"]
        }
    
    def cleanup_old_sessions(self):
        """Remove sessions older than cleanup_interval."""
        cutoff_time = datetime.now() - self.cleanup_interval
        old_sessions = [
            session_id for session_id, session in self.sessions.items()
            if session["last_activity"] < cutoff_time
        ]
        
        for session_id in old_sessions:
            del self.sessions[session_id]
            print(f"🧹 Cleaned up old session: {session_id}")
    
    def get_active_sessions(self) -> List[str]:
        """Get list of active session IDs."""
        return list(self.sessions.keys())

# Global session manager instance
session_manager = SessionManager() 