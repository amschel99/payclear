"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Send, LayoutDashboard, Settings, ScrollText, Wallet, Copy, Check, LogOut, ChevronDown } from "lucide-react";
import { useAppKit, useAppKitAccount, useDisconnect } from "@reown/appkit/react";

const navigation = [
  { name: "Send", href: "/", icon: Send },
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Audit", href: "/audit", icon: ScrollText },
  { name: "Admin", href: "/admin", icon: Settings },
];

function WalletDropdown({ address }: { address: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { disconnect } = useDisconnect();

  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const copyAddress = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
        style={{ borderRadius: 25 }}
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500" />
        <span className="font-mono text-xs">{shortAddress}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl shadow-black/40 overflow-hidden z-50">
          <div className="p-4 border-b border-zinc-800">
            <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-2">Wallet Address</p>
            <div className="flex items-center gap-2 p-2.5 rounded-md bg-zinc-800 border border-zinc-700">
              <p className="text-xs font-mono text-zinc-300 break-all flex-1 select-all leading-relaxed">
                {address}
              </p>
              <button
                onClick={copyAddress}
                className="flex-shrink-0 p-1 rounded hover:bg-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <div className="p-2">
            <button
              onClick={() => { disconnect(); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const pathname = usePathname();
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();

  return (
    <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-5xl border border-zinc-800 bg-zinc-950/80 backdrop-blur-md shadow-lg shadow-black/20" style={{ borderRadius: 25 }}>
      <div className="px-4 sm:px-5">
        <div className="flex items-center justify-between h-12">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary-500" />
            <span className="text-sm font-semibold text-white tracking-tight">
              PayClear
            </span>
          </Link>

          <nav className="hidden sm:flex items-center gap-0.5">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[13px] transition-colors ${
                    isActive
                      ? "bg-zinc-800 text-white font-medium"
                      : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-[10px] font-medium text-zinc-500 border border-zinc-800 px-2 py-0.5 rounded uppercase tracking-wider">
              devnet
            </span>
            {isConnected && address ? (
              <WalletDropdown address={address} />
            ) : (
              <button onClick={() => open()} className="btn-primary text-xs px-3.5 py-1.5" style={{ borderRadius: 25 }}>
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
