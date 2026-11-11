/**
 * Tests for user-reported failure reasons: the "Report failed print" dialog
 * and the "Fail reason statistics" widget.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { render } from '../utils';
import { server } from '../mocks/server';
import { ReportFailureModal } from '../../components/ReportFailureModal';
import { FailReasonStatisticsWidget } from '../../components/FailReasonStatisticsWidget';
import type { CustomFailureReport } from '../../api/client';

const API = '/api/v1/custom-failure-reports';
const REASONS = Array.from({ length: 10 }, (_, i) => `fail_reason_${String(i + 1).padStart(2, '0')}`);

afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});

function buildReport(id: number, overrides: Partial<CustomFailureReport> = {}): CustomFailureReport {
  return {
    id,
    custom_failure_reason: 'fail_reason_08',
    comment: null,
    reported_by: null,
    reported_at: '2026-11-02T13:50:00',
    printer_id: 1,
    printer_name: 'X2D',
    archive_id: null,
    print_name: `Part ${id}`,
    filename: `part_${id}.gcode`,
    print_status: 'failed',
    print_started_at: '2026-11-02T13:41:00',
    print_date: '2026-11-02T13:41:00',
    materials: [{ type: 'PLA', color: '#FFFFFF', grams: 4.28 }],
    filament_used_grams: 4.28,
    print_time_seconds: 1824,
    has_thumbnail: false,
    ...overrides,
  };
}

describe('ReportFailureModal', () => {
  function useTarget(existing: CustomFailureReport | null = null) {
    server.use(
      http.get(`${API}/reasons`, () => HttpResponse.json(REASONS)),
      http.get(`${API}/printers/1/target`, () =>
        HttpResponse.json({
          printer_id: 1,
          printer_name: 'X2D',
          is_current_print: false,
          archive_id: 42,
          print_name: 'schniepatz11',
          filename: 'schniepatz11_0.2mm_PLA_30m24s.gcode',
          print_status: 'failed',
          print_started_at: '2026-11-02T13:41:00',
          has_thumbnail: false,
          existing_report: existing,
        })
      )
    );
  }

  it('shows which print is flagged and leaves the name empty by default', async () => {
    useTarget();
    render(<ReportFailureModal printer={{ id: 1, name: 'X2D' }} onClose={() => {}} />);

    expect(await screen.findByText('schniepatz11')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name (optional)')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Report' })).toBeDisabled();
  });

  it('submits the chosen reason with comment and an empty name', async () => {
    useTarget();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.post(`${API}/`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(buildReport(1));
      })
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<ReportFailureModal printer={{ id: 1, name: 'X2D' }} onClose={onClose} />);

    await screen.findByText('schniepatz11');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(11));
    await user.selectOptions(screen.getByLabelText('Fail reason'), 'fail_reason_08');
    await user.type(screen.getByLabelText('Comment (optional)'), 'Spaghetti');
    await user.click(screen.getByRole('button', { name: 'Report' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body).toMatchObject({
      printer_id: 1,
      archive_id: 42,
      custom_failure_reason: 'fail_reason_08',
      comment: 'Spaghetti',
      reported_by: '',
    });
  });

  it('prefills an existing report and offers to withdraw it', async () => {
    useTarget(buildReport(7, { custom_failure_reason: 'fail_reason_03', comment: 'Warping' }));
    render(<ReportFailureModal printer={{ id: 1, name: 'X2D' }} onClose={() => {}} />);

    expect(await screen.findByRole('button', { name: 'Withdraw report' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Fail reason')).toHaveValue('fail_reason_03'));
    expect(screen.getByLabelText('Comment (optional)')).toHaveValue('Warping');
    expect(screen.getByRole('button', { name: 'Update report' })).toBeEnabled();
  });
});

describe('FailReasonStatisticsWidget', () => {
  it('lists reasons collapsed, expands to the latest prints and shows all on demand', async () => {
    const latest = Array.from({ length: 15 }, (_, i) => buildReport(17 - i, { print_name: `Part ${17 - i}` }));
    const all = Array.from({ length: 17 }, (_, i) => buildReport(17 - i, { print_name: `Part ${17 - i}` }));
    server.use(
      http.get(`${API}/stats`, () =>
        HttpResponse.json({
          total: 20,
          latest_limit: 15,
          reasons: [
            { reason: 'fail_reason_08', count: 17, percent: 85, latest },
            { reason: 'fail_reason_02', count: 3, percent: 15, latest: [] },
            { reason: 'fail_reason_05', count: 0, percent: 0, latest: [] },
          ],
        })
      ),
      http.get(`${API}/`, ({ request }) => {
        expect(new URL(request.url).searchParams.get('reason')).toBe('fail_reason_08');
        return HttpResponse.json(all);
      })
    );
    const user = userEvent.setup();
    render(<FailReasonStatisticsWidget />);

    expect(await screen.findByText('Entangled spool')).toBeInTheDocument();
    expect(screen.getByText('85.0')).toBeInTheDocument();
    expect(screen.queryByText('Part 17')).not.toBeInTheDocument(); // collapsed by default

    await user.click(screen.getByText('Entangled spool'));
    expect(screen.getByText('Part 17')).toBeInTheDocument();
    expect(screen.queryByText('Part 2')).not.toBeInTheDocument(); // only the latest 15
    expect(screen.getAllByText('2026-11-02').length).toBe(15);

    await user.click(screen.getByRole('button', { name: 'Show all (17)' }));
    expect(await screen.findByText('Part 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show all (17)' })).not.toBeInTheDocument();
  });

  it('says so when nothing has been reported', async () => {
    server.use(http.get(`${API}/stats`, () => HttpResponse.json({ total: 0, latest_limit: 15, reasons: [] })));
    render(<FailReasonStatisticsWidget dateFrom="2026-10-01" dateTo="2026-10-31" />);
    expect(await screen.findByText('No failed prints have been reported in this period.')).toBeInTheDocument();
  });
});
