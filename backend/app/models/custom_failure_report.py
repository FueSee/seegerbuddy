from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from backend.app.core.database import Base


class CustomFailureReport(Base):
    """A user-reported reason why one print run failed ("Fehldruck melden").

    Deliberately separate from PrintArchive.failure_reason / PrintLogEntry.failure_reason,
    which are filled automatically (HMS codes, "User cancelled") and stay untouched.

    One row per print run. The print's details are copied in at report time so
    the statistics stay correct after reprints (one archive, several runs) and
    after the archive is deleted.
    """

    __tablename__ = "custom_failure_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    printer_id: Mapped[int | None] = mapped_column(ForeignKey("printers.id", ondelete="SET NULL"), nullable=True)
    archive_id: Mapped[int | None] = mapped_column(
        ForeignKey("print_archives.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Reason code (e.g. "fail_reason_08"); display names live in the frontend so
    # renaming a reason never rewrites history.
    custom_failure_reason: Mapped[str] = mapped_column(String(50), index=True)
    comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Optional, empty by default: nobody has to put their name on a failed print.
    reported_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reported_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    # Snapshot of the print run at report time
    printer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    print_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    print_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    print_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # [{"type": "PLA", "color": "#FFFFFF", "grams": 4.28}, ...] — several entries for multi-material prints
    materials: Mapped[list | None] = mapped_column(JSON, nullable=True)
    filament_used_grams: Mapped[float | None] = mapped_column(Float, nullable=True)
    print_time_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)  # slicer estimate
