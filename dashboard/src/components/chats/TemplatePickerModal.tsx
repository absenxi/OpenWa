import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { Modal } from '../Modal';
import { useTemplatesQuery } from '../../hooks/queries';
import type { MessageTemplate } from '../../services/api';
import { extractPlaceholders, renderTemplatePreview } from '../../utils/templatePlaceholders';

export interface TemplatePickerModalProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  canWrite: boolean;
  onSelect: (template: MessageTemplate, vars?: Record<string, string>) => void;
  sending?: boolean;
}

export function TemplatePickerModal({
  open,
  onClose,
  sessionId,
  canWrite,
  onSelect,
  sending = false,
}: TemplatePickerModalProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [vars, setVars] = useState<Record<string, string>>({});

  const {
    data: templates = [],
    isLoading,
    isError,
  } = useTemplatesQuery(sessionId, open && Boolean(sessionId) && canWrite);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter(
      tpl =>
        tpl.name.toLowerCase().includes(q) ||
        tpl.body.toLowerCase().includes(q) ||
        (tpl.header && tpl.header.toLowerCase().includes(q)) ||
        (tpl.footer && tpl.footer.toLowerCase().includes(q)),
    );
  }, [templates, search]);

  const activePlaceholders = useMemo(() => {
    return selectedTemplate ? extractPlaceholders(selectedTemplate) : [];
  }, [selectedTemplate]);

  const handleTemplateClick = (tpl: MessageTemplate) => {
    const placeholders = extractPlaceholders(tpl);
    if (placeholders.length > 0) {
      setSelectedTemplate(tpl);
      setVars({});
    } else {
      onSelect(tpl);
    }
  };

  const handleSendWithVars = () => {
    if (!selectedTemplate) return;
    onSelect(selectedTemplate, vars);
  };

  const handleBack = () => {
    setSelectedTemplate(null);
    setVars({});
  };

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      className="template-picker-modal"
      title={selectedTemplate ? selectedTemplate.name : t('chats.templates.title')}
    >
      <div className="template-picker-content">
        {selectedTemplate ? (
          <div className="template-picker-vars-view">
            <button type="button" className="template-picker-back-btn" onClick={handleBack} disabled={sending}>
              <ArrowLeft size={16} />
              <span>{t('chats.templates.back')}</span>
            </button>

            <div className="template-picker-vars-form">
              <h3 className="template-picker-subtitle">{t('chats.templates.variablesTitle')}</h3>
              <div className="template-vars-inputs">
                {activePlaceholders.map(key => (
                  <div key={key} className="form-group template-var-field">
                    <label htmlFor={`template-var-${key}`} className="template-var-label">
                      {key}
                    </label>
                    <input
                      id={`template-var-${key}`}
                      type="text"
                      className="form-input"
                      value={vars[key] ?? ''}
                      placeholder={key}
                      disabled={sending}
                      onChange={e => setVars(prev => ({ ...prev, [key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              <div className="template-picker-preview-box">
                <div className="template-picker-preview-label">{t('templates.previewTitle')}</div>
                <div className="template-picker-preview-bubble">{renderTemplatePreview(selectedTemplate, vars)}</div>
              </div>
            </div>

            <div className="template-picker-actions">
              <button type="button" className="btn btn-secondary" onClick={handleBack} disabled={sending}>
                {t('chats.templates.back')}
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSendWithVars} disabled={sending}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : t('chats.templates.send')}
              </button>
            </div>
          </div>
        ) : (
          <div className="template-picker-list-view">
            <div className="template-picker-search-bar">
              <Search size={16} className="template-picker-search-icon" />
              <input
                type="text"
                className="form-input template-picker-search-input"
                placeholder={t('chats.templates.searchPlaceholder')}
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>

            {isLoading ? (
              <div className="template-picker-status">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : isError ? (
              <div className="template-picker-status text-error">{t('chats.templates.loadError')}</div>
            ) : filteredTemplates.length === 0 ? (
              <div className="template-picker-status text-secondary">{t('chats.templates.empty')}</div>
            ) : (
              <div className="template-picker-list">
                {filteredTemplates.map(tpl => {
                  const placeholders = extractPlaceholders(tpl);
                  const preview = renderTemplatePreview(tpl);
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      className="template-picker-card"
                      onClick={() => handleTemplateClick(tpl)}
                      disabled={sending}
                    >
                      <div className="template-picker-card-header">
                        <span className="template-picker-card-name">{tpl.name}</span>
                        {placeholders.length > 0 && (
                          <span className="template-picker-card-badge">
                            {placeholders.map(p => `{{${p}}}`).join(' ')}
                          </span>
                        )}
                      </div>
                      <div className="template-picker-card-preview">{preview}</div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
