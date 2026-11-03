import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flag, Loader2, X } from 'lucide-react';
import { api, ApiError } from '../api/client';
import type { Printer } from '../api/client';
import { Card, CardContent } from './Card';
import { Button } from './Button';
import { useToast } from '../contexts/ToastContext';
import { customFailureReasonLabel, formatIsoDay } from '../utils/customFailure';

interface ReportFailureModalProps {
  printer: Pick<Printer, 'id' | 'name'>;
  onClose: () => void;
}

/**
 * "Fehldruck melden": flag the printer's current (or most recent) print with a
 * reason. Separate from the automatic failure_reason on archives.
 */
export function ReportFailureModal({ printer, onClose }: ReportFailureModalProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const { data: target, isLoading: targetLoading, error: targetError } = useQuery({
    queryKey: ['customFailureTarget', printer.id],
    queryFn: () => api.getCustomFailureReportTarget(printer.id),
    retry: false,
  });
  const { data: reasons = [] } = useQuery({
    queryKey: ['customFailureReasons'],
    queryFn: api.getCustomFailureReasons,
  });

  const existing = target?.existing_report ?? null;
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  // Empty by default on purpose: nobody has to put their name on a failed print.
  const [reportedBy, setReportedBy] = useState('');

  useEffect(() => {
    if (existing) {
      setReason(existing.custom_failure_reason);
      setComment(existing.comment ?? '');
      setReportedBy(existing.reported_by ?? '');
    }
  }, [existing]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const refreshStats = () => {
    queryClient.invalidateQueries({ queryKey: ['customFailureStats'] });
    queryClient.invalidateQueries({ queryKey: ['customFailureReports'] });
    queryClient.invalidateQueries({ queryKey: ['customFailureTarget', printer.id] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      api.createCustomFailureReport({
        printer_id: printer.id,
        archive_id: target!.archive_id,
        custom_failure_reason: reason,
        comment,
        reported_by: reportedBy,
      }),
    onSuccess: () => {
      refreshStats();
      showToast(t('customFailure.modal.saved'), 'success');
      onClose();
    },
    onError: (error: Error) => showToast(error.message || t('customFailure.modal.saveFailed'), 'error'),
  });

  const withdrawMutation = useMutation({
    mutationFn: () => api.deleteCustomFailureReport(existing!.id),
    onSuccess: () => {
      refreshStats();
      showToast(t('customFailure.modal.withdrawn'), 'success');
      onClose();
    },
    onError: (error: Error) => showToast(error.message || t('customFailure.modal.saveFailed'), 'error'),
  });

  const busy = saveMutation.isPending || withdrawMutation.isPending;
  const noPrintYet = targetError instanceof ApiError && targetError.status === 404;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={busy ? undefined : onClose}>
      <Card className="w-full max-w-md" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Flag className="w-5 h-5 text-red-400" />
              {t('customFailure.modal.title')}
            </h3>
            <button onClick={onClose} className="p-1 hover:bg-bambu-dark rounded" aria-label={t('common.close')}>
              <X className="w-5 h-5 text-bambu-gray" />
            </button>
          </div>

          {targetLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="w-6 h-6 text-bambu-green animate-spin" />
            </div>
          ) : !target ? (
            <p className="text-sm text-bambu-gray">
              {noPrintYet ? t('customFailure.modal.noPrint') : (targetError as Error | null)?.message}
            </p>
          ) : (
            <div className="space-y-4">
              {/* Which print this report applies to */}
              <div className="rounded-lg border border-bambu-dark-tertiary bg-bambu-dark/60 p-3 flex items-center gap-3">
                {target.has_thumbnail && (
                  <img
                    src={api.getArchiveThumbnail(target.archive_id)}
                    alt=""
                    className="w-14 h-14 object-contain rounded bg-bambu-dark flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-xs text-bambu-gray">
                    {target.is_current_print ? t('customFailure.modal.currentPrint') : t('customFailure.modal.lastPrint')}
                    {' · '}
                    {printer.name}
                  </div>
                  <div className="text-sm font-medium text-white truncate" title={target.filename ?? undefined}>
                    {target.print_name || target.filename || '–'}
                  </div>
                  <div className="text-xs text-bambu-gray">{formatIsoDay(target.print_started_at)}</div>
                </div>
              </div>

              {existing && (
                <p className="text-xs text-yellow-400">
                  {t('customFailure.modal.alreadyReported', {
                    reason: customFailureReasonLabel(t, existing.custom_failure_reason),
                  })}
                </p>
              )}

              <div>
                <label htmlFor="custom-failure-reason" className="block text-sm text-bambu-gray mb-1">
                  {t('customFailure.modal.reason')}
                </label>
                <select
                  id="custom-failure-reason"
                  className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="">{t('customFailure.modal.selectReason')}</option>
                  {reasons.map((code) => (
                    <option key={code} value={code}>
                      {customFailureReasonLabel(t, code)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="custom-failure-comment" className="block text-sm text-bambu-gray mb-1">
                  {t('customFailure.modal.comment')}
                </label>
                <textarea
                  id="custom-failure-comment"
                  rows={3}
                  maxLength={2000}
                  className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t('customFailure.modal.commentPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="custom-failure-reporter" className="block text-sm text-bambu-gray mb-1">
                  {t('customFailure.modal.reportedBy')}
                </label>
                <input
                  id="custom-failure-reporter"
                  type="text"
                  maxLength={100}
                  className="w-full px-3 py-2 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg text-white focus:border-bambu-green focus:outline-none"
                  value={reportedBy}
                  onChange={(e) => setReportedBy(e.target.value)}
                />
                <p className="text-xs text-bambu-gray mt-1">{t('customFailure.modal.reportedByHelp')}</p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 mt-6">
            {existing && (
              <Button variant="danger" onClick={() => withdrawMutation.mutate()} disabled={busy}>
                {t('customFailure.modal.withdraw')}
              </Button>
            )}
            <Button variant="secondary" onClick={onClose} className="flex-1" disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              className="flex-1"
              disabled={!target || !reason || busy}
            >
              {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {existing ? t('customFailure.modal.update') : t('customFailure.modal.submit')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
