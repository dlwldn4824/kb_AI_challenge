import { useState } from 'react'
import {
  LayoutDashboard,
  MessageSquare,
  Shield,
  ClipboardCheck,
  FileSearch,
  FileText,
  Cpu,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { sidebarMenu } from '@/data/mockSession'
import kbLogo from '@/assets/kb-logo.png'

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  MessageSquare,
  Shield,
  ClipboardCheck,
  FileSearch,
  FileText,
  Cpu,
  Settings,
}

interface SidebarProps {
  activeId?: string
}

export function Sidebar({ activeId = 'ai-consultation' }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-neutral-200 bg-white transition-[width] duration-200',
        collapsed ? 'w-[72px]' : 'w-[220px]',
      )}
    >
      <div
        className={cn(
          'flex border-b border-neutral-200',
          collapsed
            ? 'flex-col items-center gap-2 px-2 py-4'
            : 'items-center gap-2 px-4 py-5',
        )}
      >
        <img
          src={kbLogo}
          alt="KB"
          className="h-9 w-9 shrink-0 rounded-lg object-cover"
        />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight text-kb-dark-gray">
              KB AI Guardian
            </p>
            <p className="mt-0.5 truncate text-[11px] leading-tight text-kb-gray/70">
              AI 운영 플랫폼
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
          title={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      <nav className={cn('flex-1 overflow-y-auto py-3', collapsed ? 'px-2' : 'px-3')}>
        {!collapsed && (
          <p className="mb-2 px-2 text-[11px] font-medium tracking-wider text-neutral-400">
            메뉴
          </p>
        )}
        <ul className="space-y-0.5">
          {sidebarMenu.map((item) => {
            const Icon = iconMap[item.icon]
            const isActive = item.id === activeId
            return (
              <li key={item.id}>
                <button
                  type="button"
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    'flex w-full items-center rounded-lg text-left text-sm transition-colors',
                    collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-2 py-2.5',
                    isActive
                      ? 'bg-kb-yellow/15 font-medium text-kb-dark-gray'
                      : 'text-kb-gray hover:bg-neutral-50 hover:text-kb-dark-gray',
                  )}
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        'h-4 w-4 shrink-0',
                        isActive ? 'text-kb-dark-gray' : 'text-kb-gray/60',
                      )}
                      strokeWidth={isActive ? 2.25 : 1.75}
                    />
                  )}
                  {!collapsed && (
                    <>
                      <span className="truncate">{item.label}</span>
                      {isActive && (
                        <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-kb-yellow" />
                      )}
                    </>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      <div
        className={cn(
          'border-t border-neutral-200 py-4',
          collapsed ? 'px-2 text-center' : 'px-5',
        )}
      >
        {collapsed ? (
          <p className="text-[10px] font-medium text-neutral-500" title="CS-2026-001248">
            Case
          </p>
        ) : (
          <>
            <p className="text-[11px] text-neutral-400">Case</p>
            <p className="mt-0.5 text-xs font-medium text-neutral-700">
              CS-2026-001248
            </p>
          </>
        )}
      </div>
    </aside>
  )
}
