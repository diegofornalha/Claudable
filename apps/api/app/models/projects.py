from typing import Optional
from sqlalchemy import String, DateTime, Text, JSON, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime
from app.db.base import Base


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="idle", index=True)  # idle, running, stopped, error
    preview_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    preview_port: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    repo_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    initial_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    template_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)  # nextjs, react, vue, etc.
    
    # Multi-CLI Session Management
    active_claude_session_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)  # Claude Code session ID
    active_cursor_session_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)  # Cursor Agent session ID
    
    # CLI Preferences
    preferred_cli: Mapped[str] = mapped_column(String(32), default="claude", nullable=False)  # claude, cursor
    selected_model: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)             # Selected model for the CLI
    fallback_enabled: Mapped[bool] = mapped_column(default=True, nullable=False)              # Enable fallback to other CLIs
    
    # Settings
    settings: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_active_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Relationships
    messages = relationship("Message", back_populates="project", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="project", cascade="all, delete-orphan")
    tools_usage = relationship("ToolUsage", back_populates="project", cascade="all, delete-orphan")
    commits = relationship("Commit", back_populates="project", cascade="all, delete-orphan")
    env_vars = relationship("EnvVar", back_populates="project", cascade="all, delete-orphan")
    service_connections = relationship("ProjectServiceConnection", back_populates="project", cascade="all, delete-orphan")
    user_requests = relationship("UserRequest", back_populates="project", cascade="all, delete-orphan")
