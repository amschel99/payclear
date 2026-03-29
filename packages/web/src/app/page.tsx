"use client";

import React, { useState, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import {
  Wallet,
  ArrowRight,
  User,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  ChevronRight,
  DollarSign,
  AlertTriangle,
  Copy,
  Check,
  RotateCcw,
  ScanFace,
  Activity,
  FileText,
  Radio,
  Lock,
} from "lucide-react";
import { verifyKyc, scoreKyt, packageTravelRule, attestOracle } from "@/lib/api";
import { explorerUrl } from "@/lib/constants";
import type { ComplianceStep, ComplianceStepStatus } from "@/lib/types";

const GlobeBackground = dynamic(() => import("@/components/GlobeBackground"), {
  ssr: false,
});

const STEPS = [
  { id: 1, label: "Wallet", icon: Wallet },
  { id: 2, label: "Details", icon: DollarSign },
  { id: 3, label: "KYC", icon: User },
  { id: 4, label: "Compliance", icon: ShieldCheck },
];

function StepIndicator({
  currentStep,
  steps,
}: {
  currentStep: number;
  steps: typeof STEPS;
}) {
  return (
    <div className="flex items-center justify-between mb-10 max-w-md mx-auto">
      {steps.map((step, index) => {
        const isCompleted = currentStep > step.id;
        const isCurrent = currentStep === step.id;

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-2">
              <div
                className={`flex items-center justify-center w-9 h-9 rounded-full text-xs font-semibold transition-all duration-300 ${
                  isCompleted
                    ? "bg-primary-600 text-white"
                    : isCurrent
                    ? "border-2 border-primary-500 text-primary-400 bg-primary-500/10"
                    : "border border-zinc-700 text-zinc-600 bg-zinc-900"
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : step.id}
              </div>
              <span
                className={`text-[11px] font-medium transition-colors ${
                  isCompleted || isCurrent ? "text-zinc-300" : "text-zinc-600"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className="flex-1 h-px mx-3 -mt-6">
                <div
                  className={`h-full transition-colors duration-500 ${
                    currentStep > step.id ? "bg-primary-600" : "bg-zinc-800"
                  }`}
                />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ComplianceChecklist({ steps }: { steps: ComplianceStep[] }) {
  const statusIcon = (status: ComplianceStepStatus) => {
    switch (status) {
      case "running":
        return <Loader2 className="w-4 h-4 text-primary-400 animate-spin" />;
      case "passed":
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case "failed":
        return <XCircle className="w-4 h-4 text-red-400" />;
      default:
        return <div className="w-4 h-4 rounded-full border border-zinc-700" />;
    }
  };

  return (
    <div className="space-y-2">
      {steps.map((step) => (
        <div
          key={step.id}
          className={`flex items-start gap-3 p-3.5 rounded-lg border transition-all duration-300 ${
            step.status === "running"
              ? "border-primary-500/30 bg-primary-500/5"
              : step.status === "passed"
              ? "border-emerald-500/20 bg-emerald-500/5"
              : step.status === "failed"
              ? "border-red-500/20 bg-red-500/5"
              : "border-zinc-800 bg-zinc-900/50"
          }`}
        >
          <div className="mt-0.5">{statusIcon(step.status)}</div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium ${step.status === "pending" ? "text-zinc-500" : "text-zinc-200"}`}>
              {step.label}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">{step.description}</p>
            {step.detail && (
              <p className="text-xs text-zinc-400 mt-1.5 font-mono bg-zinc-800/50 rounded-md px-2.5 py-1.5 border border-zinc-700/50 break-all">
                {step.detail}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SendPage() {
  const { open } = useAppKit();
  const { address, isConnected: connected } = useAppKitAccount();
  const [modalOpen, setModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [copied, setCopied] = useState(false);
  const [txCopied, setTxCopied] = useState(false);

  const [receiverWallet, setReceiverWallet] = useState("");
  const [walletError, setWalletError] = useState("");
  const [amount, setAmount] = useState("");
  const [receiverName, setReceiverName] = useState("");

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [nationality, setNationality] = useState("");
  const [kycLoading, setKycLoading] = useState(false);
  const [kycResult, setKycResult] = useState<{
    verified: boolean;
    status: "verified" | "pending" | "rejected";
    kycLevel: number;
  } | null>(null);
  const [kycError, setKycError] = useState("");

  const [complianceSteps, setComplianceSteps] = useState<ComplianceStep[]>([
    { id: "kyt", label: "KYT Risk Scoring", description: "Analyzing transaction risk factors", status: "pending" },
    { id: "travel", label: "Travel Rule Packaging", description: "Packaging originator & beneficiary data", status: "pending" },
    { id: "attest", label: "Oracle Attestation", description: "On-chain compliance attestation via Solana program", status: "pending" },
  ]);
  const [txSignature, setTxSignature] = useState("");
  const [settlementError, setSettlementError] = useState("");
  const [complianceRunning, setComplianceRunning] = useState(false);

  useEffect(() => {
    if (connected && currentStep === 1) setCurrentStep(2);
    if (!connected && currentStep > 1) setCurrentStep(1);
  }, [connected, currentStep]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (modalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [modalOpen]);

  const walletAddress = address || "";
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : "";

  const copyAddress = useCallback(() => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [walletAddress]);

  const isValidSolanaAddress = (addr: string) =>
    /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);

  const handlePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiverWallet || !amount || !receiverName) return;
    if (!isValidSolanaAddress(receiverWallet)) {
      setWalletError("Invalid Solana address.");
      return;
    }
    setWalletError("");
    setCurrentStep(3);
  };

  const handleKycSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName || !dateOfBirth || !nationality) return;
    setKycLoading(true);
    setKycError("");
    try {
      const result = await verifyKyc({ wallet: walletAddress, fullName, dateOfBirth, nationality });
      setKycResult({ verified: result.verified, status: result.status, kycLevel: result.kycLevel });
      if (result.verified) setTimeout(() => setCurrentStep(4), 600);
      else if (result.status === "pending")
        setKycError("Verification is being processed. You'll be notified when it's complete.");
    } catch (err: unknown) {
      setKycError(err instanceof Error ? err.message : "KYC verification failed");
    } finally {
      setKycLoading(false);
    }
  };

  const updateComplianceStep = (id: string, status: ComplianceStepStatus, detail?: string) => {
    setComplianceSteps((prev) => prev.map((s) => (s.id === id ? { ...s, status, detail } : s)));
  };

  const runCompliance = useCallback(async () => {
    if (complianceRunning) return;
    setComplianceRunning(true);
    setSettlementError("");
    setTxSignature("");
    setComplianceSteps((prev) => prev.map((s) => ({ ...s, status: "pending" as ComplianceStepStatus, detail: undefined })));

    try {
      updateComplianceStep("kyt", "running");
      const kytResult = await scoreKyt({
        senderWallet: walletAddress, receiverWallet,
        amount: parseFloat(amount), currency: "USDC",
      });
      if (!kytResult.passed) {
        updateComplianceStep("kyt", "failed", `Risk score: ${kytResult.score}/100 — ${kytResult.factors.join(", ")}`);
        setSettlementError(`Transaction blocked: KYT risk score ${kytResult.score}/100 exceeds threshold`);
        setComplianceRunning(false);
        return;
      }
      updateComplianceStep("kyt", "passed", `Risk score: ${kytResult.score}/100 — ${kytResult.factors.join(", ")}`);

      updateComplianceStep("travel", "running");
      const travelResult = await packageTravelRule({
        originator: { name: fullName, wallet: walletAddress, institution: "PayClear User" },
        beneficiary: { name: receiverName, wallet: receiverWallet, institution: "PayClear User" },
        amount: parseFloat(amount), currency: "USDC",
      });
      updateComplianceStep("travel", "passed", `Nonce: ${travelResult.transferNonce} | Hash: ${travelResult.hash.slice(0, 16)}...`);

      updateComplianceStep("attest", "running");
      const attestResult = await attestOracle({ transferNonce: travelResult.transferNonce });
      updateComplianceStep("attest", "passed", `TX: ${attestResult.txSignature.slice(0, 16)}...`);
      setTxSignature(attestResult.txSignature);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Compliance check failed";
      setSettlementError(message);
      setComplianceSteps((prev) => {
        const running = prev.find((s) => s.status === "running");
        if (running) return prev.map((s) => s.id === running.id ? { ...s, status: "failed" as ComplianceStepStatus, detail: message } : s);
        return prev;
      });
    } finally {
      setComplianceRunning(false);
    }
  }, [walletAddress, receiverWallet, amount, fullName, receiverName, complianceRunning]);

  useEffect(() => {
    if (currentStep === 4 && !complianceRunning && !txSignature && !settlementError) runCompliance();
  }, [currentStep, complianceRunning, txSignature, settlementError, runCompliance]);

  const openSendModal = () => {
    if (!connected) {
      open();
    } else {
      setModalOpen(true);
    }
  };

  const closeModal = () => {
    if (complianceRunning) return;
    setModalOpen(false);
  };

  const resetAndClose = () => {
    setModalOpen(false);
    setCurrentStep(connected ? 2 : 1);
    setReceiverWallet("");
    setReceiverName("");
    setAmount("");
    setFullName("");
    setDateOfBirth("");
    setNationality("");
    setKycResult(null);
    setKycError("");
    setTxSignature("");
    setSettlementError("");
    setComplianceSteps((prev) => prev.map((s) => ({ ...s, status: "pending" as ComplianceStepStatus, detail: undefined })));
  };

  return (
    <div className="min-h-screen relative">
      {/* Globe background */}
      <div
        className="fixed pointer-events-none"
        style={{ right: "-10%", top: "5%", width: "65vw", height: "85vh", zIndex: 0 }}
      >
        <GlobeBackground />
      </div>

      {/* Hero Section */}
      <section className="relative z-[1] pt-16 pb-16 px-4 min-h-[calc(100vh-4rem)] flex items-center">
        <div className="max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/80 mb-8">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-zinc-400">Live on Solana Devnet</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-[1.1] tracking-tight max-w-3xl">
            Compliant stablecoin payments on{" "}
            <span className="text-primary-500">Solana</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-zinc-400 max-w-2xl leading-relaxed">
            KYC verification, transaction risk scoring, Travel Rule compliance, and on-chain attestation — all in a single transfer flow.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button onClick={openSendModal} className="btn-primary text-base px-6 py-3" style={{ borderRadius: 25 }}>
              {!connected ? "Connect Wallet" : "Send a Payment"}
            </button>
          </div>

          {/* Features */}
          <div className="mt-14 flex flex-wrap gap-3">
            {[
              { icon: ScanFace, title: "KYC Verification" },
              { icon: Activity, title: "KYT Risk Scoring" },
              { icon: FileText, title: "Travel Rule" },
              { icon: Radio, title: "Oracle Attestation" },
              { icon: Lock, title: "On-chain Compliance" },
            ].map((feature) => (
              <div
                key={feature.title}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-800 bg-zinc-900/60"
              >
                <feature.icon className="w-4 h-4 text-primary-400" />
                <span className="text-sm text-zinc-300">{feature.title}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Send Payment Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 sm:pt-24">
          {/* Blurred backdrop */}
          <div
            className="absolute inset-0 bg-zinc-950/60 backdrop-blur-md"
            onClick={closeModal}
          />

          {/* Modal content */}
          <div className="relative z-10 w-full max-w-lg mx-4 max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl shadow-black/50 p-6">
            {/* Close button */}
            <button
              onClick={closeModal}
              disabled={complianceRunning}
              className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-40"
            >
              <XCircle className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <h2 className="text-xl font-bold text-white">Send Payment</h2>
              <p className="text-sm text-zinc-500 mt-1">
                Compliant USDC transfer with full regulatory checks
              </p>
            </div>

            <StepIndicator currentStep={currentStep} steps={STEPS} />

            {/* STEP 1: Connect Wallet */}
            {currentStep === 1 && (
              <div className="text-center py-12 animate-fade-in">
                <div className="w-12 h-12 rounded-2xl bg-zinc-800 border border-zinc-700 flex items-center justify-center mx-auto mb-5">
                  <Wallet className="w-5 h-5 text-zinc-500" />
                </div>
                <h2 className="text-base font-semibold text-white mb-1.5">
                  Connect your wallet
                </h2>
                <p className="text-sm text-zinc-500 mb-7 max-w-xs mx-auto leading-relaxed">
                  Connect a Solana wallet to begin a compliant USDC transfer on devnet.
                </p>
                <button onClick={() => open()} className="btn-primary">
                  <Wallet className="w-4 h-4" />
                  Connect Wallet
                </button>
              </div>
            )}

            {/* STEP 2: Payment Details */}
            {currentStep === 2 && (
              <div className="animate-fade-in">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-zinc-800/50 border border-zinc-700/50 mb-6">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-xs text-zinc-500">Connected:</span>
                    <span className="text-xs font-mono font-medium text-zinc-200">{shortAddress}</span>
                  </div>
                  <button onClick={copyAddress} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <form onSubmit={handlePaymentSubmit} className="space-y-4">
                  <div>
                    <label className="label">Recipient name</label>
                    <input type="text" className="input" placeholder="Jane Smith" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Recipient wallet address</label>
                    <input
                      type="text"
                      className={`input font-mono text-xs ${walletError ? "border-red-500/50 focus:ring-red-500/20" : ""}`}
                      placeholder="Solana wallet address"
                      value={receiverWallet}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setReceiverWallet(e.target.value); if (walletError) setWalletError(""); }}
                      required minLength={32} maxLength={44}
                    />
                    {walletError && <p className="text-xs text-red-400 mt-1.5">{walletError}</p>}
                  </div>
                  <div>
                    <label className="label">Amount (USDC)</label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-600 text-sm font-medium">$</span>
                      <input type="number" className="input pl-7" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required min="0.01" step="0.01" />
                    </div>
                    <p className="text-xs text-zinc-600 mt-1.5">Network fee: ~0.000005 SOL</p>
                  </div>
                  <button type="submit" className="btn-primary w-full mt-2">
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}

            {/* STEP 3: KYC */}
            {currentStep === 3 && (
              <div className="animate-fade-in">
                <h3 className="text-base font-semibold text-white mb-1">Identity verification</h3>
                <p className="text-sm text-zinc-500 mb-6">KYC is required for compliant stablecoin transfers over regulatory thresholds.</p>

                {kycResult?.verified ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    </div>
                    <h3 className="text-sm font-semibold text-white mb-1">Identity verified</h3>
                    <p className="text-xs text-zinc-500">KYC Level {kycResult.kycLevel} — Proceeding to compliance checks...</p>
                  </div>
                ) : kycResult?.status === "pending" ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-6 h-6 text-amber-400 animate-spin mx-auto mb-4" />
                    <h3 className="text-sm font-semibold text-white mb-1">Verification in progress</h3>
                    <p className="text-xs text-zinc-500 max-w-xs mx-auto">
                      Your identity is being reviewed. This usually takes a few minutes.
                    </p>
                    <button type="button" className="mt-4 btn-secondary text-xs" onClick={() => { setKycResult(null); setKycError(""); }}>
                      <RotateCcw className="w-3.5 h-3.5" /> Try Again
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleKycSubmit} className="space-y-4">
                    <div>
                      <label className="label">Full legal name</label>
                      <input type="text" className="input" placeholder="John Michael Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required disabled={kycLoading} />
                    </div>
                    <div>
                      <label className="label">Date of birth</label>
                      <input type="date" className="input" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} required disabled={kycLoading} />
                    </div>
                    <div>
                      <label className="label">Nationality</label>
                      <select className="input" value={nationality} onChange={(e) => setNationality(e.target.value)} required disabled={kycLoading}>
                        <option value="">Select country</option>
                        <option value="US">United States</option>
                        <option value="GB">United Kingdom</option>
                        <option value="SG">Singapore</option>
                        <option value="CH">Switzerland</option>
                        <option value="DE">Germany</option>
                        <option value="JP">Japan</option>
                        <option value="KR">South Korea</option>
                        <option value="AU">Australia</option>
                        <option value="CA">Canada</option>
                        <option value="FR">France</option>
                      </select>
                    </div>

                    {kycError && (
                      <div className="flex items-center gap-2 p-3.5 rounded-lg bg-red-500/5 border border-red-500/20">
                        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        <p className="text-sm text-red-300">{kycError}</p>
                      </div>
                    )}

                    <div className="flex gap-3 pt-1">
                      <button type="button" className="btn-secondary flex-1" onClick={() => setCurrentStep(2)} disabled={kycLoading}>Back</button>
                      <button type="submit" className="btn-primary flex-1" disabled={kycLoading}>
                        {kycLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</> : <>Verify Identity <ChevronRight className="w-4 h-4" /></>}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* STEP 4: Compliance & Settlement */}
            {currentStep === 4 && (
              <div className="space-y-4 animate-fade-in">
                <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
                  <h3 className="text-sm font-semibold text-zinc-300 mb-3">Transfer summary</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-xs text-zinc-600">From</span>
                      <p className="font-mono text-sm text-zinc-200 mt-0.5 truncate">{shortAddress}</p>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-600">To</span>
                      <p className="text-sm text-zinc-200 mt-0.5 truncate">{receiverName}</p>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-600">Amount</span>
                      <p className="text-xl font-bold text-white mt-0.5">
                        ${parseFloat(amount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        <span className="text-xs font-normal text-zinc-600 ml-1.5">USDC</span>
                      </p>
                    </div>
                    <div>
                      <span className="text-xs text-zinc-600">KYC</span>
                      <p className="mt-1"><span className="badge-settled">Verified L{kycResult?.kycLevel || 1}</span></p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-800 bg-zinc-800/30 p-4">
                  <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary-400" />
                    Compliance pipeline
                  </h3>
                  <ComplianceChecklist steps={complianceSteps} />

                  {settlementError && (
                    <div className="flex items-center gap-2 p-3.5 mt-3 rounded-lg bg-red-500/5 border border-red-500/20">
                      <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <p className="text-sm text-red-300">{settlementError}</p>
                    </div>
                  )}
                </div>

                {txSignature && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 animate-fade-in">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">Transfer settled</h3>
                        <p className="text-xs text-zinc-500">On-chain attestation confirmed on Solana devnet</p>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs text-zinc-500">Transaction signature</p>
                        <button onClick={() => { navigator.clipboard.writeText(txSignature); setTxCopied(true); setTimeout(() => setTxCopied(false), 2000); }} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                          {txCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <p className="text-xs font-mono text-zinc-300 break-all">{txSignature}</p>
                    </div>
                    <a href={explorerUrl(txSignature)} target="_blank" rel="noopener noreferrer" className="btn-primary w-full mt-4 text-xs">
                      View on Solana Explorer <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}

                <div className="flex gap-3">
                  {!complianceRunning && !txSignature && settlementError && (
                    <>
                      <button onClick={runCompliance} className="btn-primary flex-1">Retry <ArrowRight className="w-4 h-4" /></button>
                      <button onClick={() => { setCurrentStep(2); setSettlementError(""); setComplianceSteps((prev: ComplianceStep[]) => prev.map((s: ComplianceStep) => ({ ...s, status: "pending" as const, detail: undefined }))); }} className="btn-secondary" title="Edit payment details">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {txSignature && (
                    <button onClick={resetAndClose} className="btn-secondary flex-1">
                      Done
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
