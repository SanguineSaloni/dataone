"use client";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "password" | "number" | "select";
  required: boolean;
  secret?: boolean;
  default?: string | number;
  placeholder?: string;
  help_text?: string;
  options?: string[];
}

interface ConnectorTypeMetadata {
  name: string;
  type: string;
  category: string;
  icon: string;
  description: string;
  fields: FieldDef[];
  secret_fields: string[];
}

interface DynamicConnectorFormProps {
  connectorType: string;
  onChange: (config: Record<string, unknown>) => void;
  initialValues?: Record<string, unknown>;
}

export default function DynamicConnectorForm({ 
  connectorType, 
  onChange, 
  initialValues = {} 
}: DynamicConnectorFormProps) {
  const [metadata, setMetadata] = useState<ConnectorTypeMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, unknown>>(initialValues);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const data = await api.get<ConnectorTypeMetadata>(`/api/v1/connectors/types/${connectorType}`);
        setMetadata(data);
        
        // Initialize with defaults if no initial values
        if (Object.keys(initialValues).length === 0) {
          const defaults: Record<string, unknown> = {};
          data.fields.forEach(field => {
            if (field.default !== undefined) {
              defaults[field.key] = field.default;
            }
          });
          setValues(defaults);
          onChange(defaults);
        }
      } catch (err) {
        console.error("Failed to fetch connector metadata:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetadata();
  }, [connectorType]);

  const handleFieldChange = (key: string, value: string | number) => {
    const newValues = { ...values, [key]: value };
    setValues(newValues);
    onChange(newValues);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-fg-subtle">
        Loading form fields...
      </div>
    );
  }

  if (!metadata) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-xs text-danger">
        Failed to load connector type metadata
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {metadata.fields.map(field => (
        <div key={field.key} className="flex flex-col gap-1">
          <label htmlFor={`field-${field.key}`} className="text-xs text-fg-subtle">
            {field.label}
            {field.required && <span className="text-danger ml-1">*</span>}
          </label>
          
          {field.type === "select" && field.options ? (
            <select
              id={`field-${field.key}`}
              value={String(values[field.key] ?? "")}
              onChange={e => handleFieldChange(field.key, e.target.value)}
              required={field.required}
              className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            >
              <option value="">Select...</option>
              {field.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : field.type === "number" ? (
            <input
              id={`field-${field.key}`}
              type="number"
              value={values[field.key] as number ?? ""}
              onChange={e => handleFieldChange(field.key, parseInt(e.target.value, 10))}
              required={field.required}
              placeholder={field.placeholder}
              className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
          ) : (
            <input
              id={`field-${field.key}`}
              type={field.type === "password" ? "password" : "text"}
              value={String(values[field.key] ?? "")}
              onChange={e => handleFieldChange(field.key, e.target.value)}
              required={field.required}
              placeholder={field.placeholder}
              className="rounded-lg border border-border-strong bg-surface-overlay px-3 py-2 text-sm text-fg focus:border-accent focus:outline-none"
            />
          )}
          
          {field.help_text && (
            <p className="text-xs text-fg-subtle italic">{field.help_text}</p>
          )}
        </div>
      ))}
    </div>
  );
}
