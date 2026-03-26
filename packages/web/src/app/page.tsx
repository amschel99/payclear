"use client";

import React, { useState, useCallback, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
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
} from "lucide-react";
import { verifyKyc, scoreKyt, packageTravelRule, attestOracle } from "@/lib/api";
import { explorerUrl } from "@/lib/constants";
import type { ComplianceStep, ComplianceStepStatus } from "@/lib/types";

const STEPS = [
  { id: 1, label: "Connect Wallet", icon: Wallet },
  { id: 2, label: "Payment Details", icon: DollarSign },
  { id: 3, label: "KYC Verification", icon: User },
  { id: 4, label: "Compliance & Settle", icon: ShieldCheck },
];

function StepIndicator({
  currentStep,
  steps,
}: {
  currentStep: number;
  steps: typeof STEPS;
}) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10">
      {steps.map((step, index) => {
        const isCompleted = currentStep > step.id;
        const isCurrent = currentStep === step.id;
        const isPending = currentStep < step.id;

        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-2 min-w-[100px]">
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300 ${
                  isCompleted
                    ? "bg-primary-600 border-primary-600 text-white"
                    : isCurrent
                    ? "bg-white border-primary-600 text-primary-600"
                    : "bg-white border-gray-200 text-gray-400"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-5 h-5" />
                ) : (
                  <span className="text-sm font-semibold">{step.id}</span>
                )}
              </div>
              <span
                className={`text-xs font-medium text-center transition-colors ${
                  isCompleted
                    ? "text-primary-600"
                    : isCurrent
                    ? "text-gray-900"
                    : "text-gray-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className="flex-1 max-w-[60px] h-0.5 -mt-6 mx-1">
                <div
                  className={`h-full rounded-full transition-colors duration-300 ${
                    currentStep > step.id ? "bg-primary-600" : "bg-gray-200"
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

function ComplianceChecklist({
  steps,
}: {
  steps: ComplianceStep[];
}) {
  const statusIcon = (status: ComplianceStepStatus) => {
    switch (status) {
      case "running":
        return <Loader2 className="w-5 h-5 text-primary-600 animate-spin" />;
      case "passed":
        return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
      case "failed":
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return (
          <div className="w-5 h-5 rounded-full border-2 border-gray-200" />
        );
    }
  };

  return (
    <div className="space-y-3">
      {steps.map((step) => (
        <div
          key={step.id}
          className={`flex items-start gap-3 p-4 rounded-lg border transition-all duration-300 ${
            step.status === "running"
              ? "border-primary-200 bg-primary-50/50"
              : step.status === "passed"
              ? "border-emerald-200 bg-emerald-50/30"
              : step.status === "failed"
              ? "border-red-200 bg-red-50/30"
              : "border-gray-100 bg-gray-50/50"
          }`}
        >
          <div className="mt-0.5">{statusIcon(step.status)}</div>
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-semibold ${
                step.status === "pending" ? "text-gray-400" : "text-gray-900"
              }`}
            >
              {step.label}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">{step.description}</p>
            {step.detail && (
              <p className="text-xs text-gray-600 mt-1.5 font-mono bg-white/60 rounded px-2 py-1 border border-gray-100 break-all">
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
  const { publicKey, connected } = useWallet();
  const [currentStep, setCurrentStep] = useState(1);
  const [copied, setCopied] = useState(false);
  const [txCopied, setTxCopied] = useState(false);

  // Step 2 state
  const [receiverWallet, setReceiverWallet] = useState("");
  const [walletError, setWalletError] = useState("");
  const [amount, setAmount] = useState("");
  const [receiverName, setReceiverName] = useState("");

  // Step 3 state
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

  // Step 4 state
  const [complianceSteps, setComplianceSteps] = useState<ComplianceStep[]>([
    {
      id: "kyt",
      label: "KYT Risk Scoring",
      description: "Analyzing transaction risk factors",
      status: "pending",
    },
    {
      id: "travel",
      label: "Travel Rule Packaging",
      description: "Packaging originator & beneficiary data",
      status: "pending",
    },
    {
      id: "attest",
      label: "Oracle Attestation",
      description: "On-chain compliance attestation via Solana program",
      status: "pending",
    },
  ]);
  const [txSignature, setTxSignature] = useState("");
  const [settlementError, setSettlementError] = useState("");
  const [complianceRunning, setComplianceRunning] = useState(false);

  // Auto-advance from step 1 when wallet connects
  useEffect(() => {
    if (connected && currentStep === 1) {
      setCurrentStep(2);
    }
    if (!connected && currentStep > 1) {
      setCurrentStep(1);
    }
  }, [connected, currentStep]);

  const walletAddress = publicKey?.toBase58() || "";
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
      setWalletError("Invalid Solana address — must be base58, 32–44 characters.");
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
      const result = await verifyKyc({
        wallet: walletAddress,
        fullName,
        dateOfBirth,
        nationality,
      });
      setKycResult({ verified: result.verified, status: result.status, kycLevel: result.kycLevel });
      if (result.verified) {
        setTimeout(() => setCurrentStep(4), 800);
      } else if (result.status === "pending") {
        setKycError("Verification is being processed by Sumsub. You'll be notified when it's complete.");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "KYC verification failed";
      setKycError(message);
    } finally {
      setKycLoading(false);
    }
  };

  const updateComplianceStep = (
    id: string,
    status: ComplianceStepStatus,
    detail?: string
  ) => {
    setComplianceSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status, detail } : s))
    );
  };

  const runCompliance = useCallback(async () => {
    if (complianceRunning) return;
    setComplianceRunning(true);
    setSettlementError("");
    setTxSignature("");

    // Reset steps
    setComplianceSteps((prev) =>
      prev.map((s) => ({ ...s, status: "pending" as ComplianceStepStatus, detail: undefined }))
    );

    try {
      // Step 1: KYT Scoring
      updateComplianceStep("kyt", "running");
      const kytResult = await scoreKyt({
        senderWallet: walletAddress,
        receiverWallet,
        amount: parseFloat(amount),
        currency: "USDC",
      });

      if (!kytResult.passed) {
        updateComplianceStep(
          "kyt",
          "failed",
          `Risk score: ${kytResult.score}/100 — ${kytResult.factors.join(", ")}`
        );
        setSettlementError(
          `Transaction blocked: KYT risk score ${kytResult.score}/100 exceeds threshold`
        );
        setComplianceRunning(false);
        return;
      }
      updateComplianceStep(
        "kyt",
        "passed",
        `Risk score: ${kytResult.score}/100 — ${kytResult.factors.join(", ")}`
      );

      // Step 2: Travel Rule
      updateComplianceStep("travel", "running");
      const travelResult = await packageTravelRule({
        originator: {
          name: fullName,
          wallet: walletAddress,
          institution: "PayClear User",
        },
        beneficiary: {
          name: receiverName,
          wallet: receiverWallet,
          institution: "PayClear User",
        },
        amount: parseFloat(amount),
        currency: "USDC",
      });
      updateComplianceStep(
        "travel",
        "passed",
        `Nonce: ${travelResult.transferNonce} | Hash: ${travelResult.hash.slice(0, 16)}...`
      );

      // Step 3: Oracle Attestation
      updateComplianceStep("attest", "running");
      const attestResult = await attestOracle({
        transferNonce: travelResult.transferNonce,
      });
      updateComplianceStep(
        "attest",
        "passed",
        `TX: ${attestResult.txSignature.slice(0, 16)}...`
      );
      setTxSignature(attestResult.txSignature);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Compliance check failed";
      setSettlementError(message);
      // Mark first running step as failed
      setComplianceSteps((prev) => {
        const running = prev.find((s) => s.status === "running");
        if (running) {
          return prev.map((s) =>
            s.id === running.id ? { ...s, status: "failed" as ComplianceStepStatus, detail: message } : s
          );
        }
        return prev;
      });
    } finally {
      setComplianceRunning(false);
    }
  }, [walletAddress, receiverWallet, amount, fullName, receiverName, complianceRunning]);

  // Auto-run compliance when reaching step 4
  useEffect(() => {
    if (currentStep === 4 && !complianceRunning && !txSignature && !settlementError) {
      runCompliance();
    }
  }, [currentStep, complianceRunning, txSignature, settlementError, runCompliance]);

  return (
    <div className="gradient-bg min-h-[calc(100vh-64px)]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        {/* Page heading */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Send Payment
          </h1>
          <p className="text-gray-500 text-sm">
            Compliant USDC transfer with automated KYC, KYT, and Travel Rule
          </p>
        </div>

        {/* Step indicator */}
        <StepIndicator currentStep={currentStep} steps={STEPS} />

        {/* Step content */}
        <div className="animate-fade-in">
          {/* STEP 1: Connect Wallet */}
          {currentStep === 1 && (
            <div className="card text-center py-12 animate-slide-up">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-2xl bg-primary-50 flex items-center justify-center">
                  <Wallet className="w-8 h-8 text-primary-600" />
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Connect Your Wallet
              </h2>
              <p className="text-gray-500 text-sm mb-8 max-w-sm mx-auto">
                Connect your Solana wallet to start a compliant USDC transfer on
                devnet.
              </p>
              <div className="flex justify-center">
                <WalletMultiButton />
              </div>
            </div>
          )}

          {/* STEP 2: Payment Details */}
          {currentStep === 2 && (
            <div className="card animate-slide-up">
              {/* Wallet info bar */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm text-gray-600">Connected:</span>
                  <span className="text-sm font-mono font-medium text-gray-900">
                    {shortAddress}
                  </span>
                </div>
                <button
                  onClick={copyAddress}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>

              <h2 className="text-lg font-bold text-gray-900 mb-1">
                Payment Details
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Enter the recipient information and transfer amount.
              </p>

              <form onSubmit={handlePaymentSubmit} className="space-y-5">
                <div>
                  <label className="label">Recipient Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="Jane Smith"
                    value={receiverName}
                    onChange={(e) => setReceiverName(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="label">Recipient Wallet Address</label>
                  <input
                    type="text"
                    className={`input font-mono text-sm ${walletError ? "border-red-400 focus:ring-red-300" : ""}`}
                    placeholder="Enter Solana wallet address"
                    value={receiverWallet}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      setReceiverWallet(e.target.value);
                      if (walletError) setWalletError("");
                    }}
                    required
                    minLength={32}
                    maxLength={44}
                  />
                  {walletError && (
                    <p className="text-xs text-red-600 mt-1">{walletError}</p>
                  )}
                </div>

                <div>
                  <label className="label">Amount (USDC)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">
                      $
                    </span>
                    <input
                      type="number"
                      className="input pl-8"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                      min="0.01"
                      step="0.01"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1.5">
                    Network fee: ~0.000005 SOL
                  </p>
                </div>

                <button type="submit" className="btn-primary w-full mt-2">
                  Continue
                  <ChevronRight className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}

          {/* STEP 3: KYC Verification */}
          {currentStep === 3 && (
            <div className="card animate-slide-up">
              <h2 className="text-lg font-bold text-gray-900 mb-1">
                Identity Verification
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                KYC is required for compliant stablecoin transfers over
                regulatory thresholds.
              </p>

              {kycResult?.verified ? (
                <div className="text-center py-8 animate-fade-in">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    Identity Verified
                  </h3>
                  <p className="text-sm text-gray-500">
                    KYC Level {kycResult.kycLevel} — Proceeding to compliance
                    checks...
                  </p>
                </div>
              ) : kycResult?.status === "pending" ? (
                <div className="text-center py-8 animate-fade-in">
                  <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    Verification In Progress
                  </h3>
                  <p className="text-sm text-gray-500">
                    Sumsub is reviewing your identity. This usually takes a few minutes.
                    You&apos;ll be able to proceed once verification is complete.
                  </p>
                  <button
                    type="button"
                    className="mt-4 btn-secondary inline-flex items-center gap-2"
                    onClick={() => { setKycResult(null); setKycError(""); }}
                  >
                    <RotateCcw className="w-4 h-4" />
                    Try Again
                  </button>
                </div>
              ) : (
                <form onSubmit={handleKycSubmit} className="space-y-5">
                  <div>
                    <label className="label">Full Legal Name</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="John Michael Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      required
                      disabled={kycLoading}
                    />
                  </div>

                  <div>
                    <label className="label">Date of Birth</label>
                    <input
                      type="date"
                      className="input"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      required
                      disabled={kycLoading}
                    />
                  </div>

                  <div>
                    <label className="label">Nationality</label>
                    <select
                      className="input"
                      value={nationality}
                      onChange={(e) => setNationality(e.target.value)}
                      required
                      disabled={kycLoading}
                    >
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
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-700">{kycError}</p>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      className="btn-secondary flex-1"
                      onClick={() => setCurrentStep(2)}
                      disabled={kycLoading}
                    >
                      Back
                    </button>
                    <button
                      type="submit"
                      className="btn-primary flex-1"
                      disabled={kycLoading}
                    >
                      {kycLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        <>
                          Verify Identity
                          <ChevronRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* STEP 4: Compliance & Settlement */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-slide-up">
              {/* Transfer summary */}
              <div className="card">
                <h2 className="text-lg font-bold text-gray-900 mb-4">
                  Transfer Summary
                </h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">From</span>
                    <p className="font-mono font-medium text-gray-900 mt-0.5 truncate">
                      {shortAddress}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">To</span>
                    <p className="font-medium text-gray-900 mt-0.5 truncate">
                      {receiverName}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Amount</span>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">
                      ${parseFloat(amount || "0").toLocaleString("en-US", { minimumFractionDigits: 2 })} <span className="text-sm font-medium text-gray-400">USDC</span>
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">KYC Status</span>
                    <p className="mt-0.5">
                      <span className="badge-settled">Verified L{kycResult?.kycLevel || 1}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Compliance checklist */}
              <div className="card">
                <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-primary-600" />
                  Compliance Pipeline
                </h3>
                <ComplianceChecklist steps={complianceSteps} />

                {settlementError && (
                  <div className="flex items-center gap-2 p-3 mt-4 rounded-lg bg-red-50 border border-red-100">
                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-700">{settlementError}</p>
                  </div>
                )}
              </div>

              {/* Settlement result */}
              {txSignature && (
                <div className="card border-emerald-200 bg-emerald-50/30 animate-fade-in">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        Transfer Settled
                      </h3>
                      <p className="text-xs text-gray-500">
                        On-chain attestation confirmed on Solana devnet
                      </p>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-white border border-emerald-100">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-gray-500">Transaction Signature</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(txSignature);
                          setTxCopied(true);
                          setTimeout(() => setTxCopied(false), 2000);
                        }}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {txCopied ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                    <p className="text-sm font-mono text-gray-900 break-all">
                      {txSignature}
                    </p>
                  </div>
                  <a
                    href={explorerUrl(txSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary w-full mt-4"
                  >
                    View on Solana Explorer
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                {!complianceRunning && !txSignature && settlementError && (
                  <>
                    <button
                      onClick={runCompliance}
                      className="btn-primary flex-1"
                    >
                      Retry Compliance Check
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setCurrentStep(2);
                        setSettlementError("");
                        setComplianceSteps((prev: ComplianceStep[]) =>
                          prev.map((s: ComplianceStep) => ({ ...s, status: "pending" as const, detail: undefined }))
                        );
                      }}
                      className="btn-secondary"
                      title="Edit payment details"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </>
                )}
                {txSignature && (
                  <button
                    onClick={() => {
                      setCurrentStep(2);
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
                      setComplianceSteps((prev) =>
                        prev.map((s) => ({
                          ...s,
                          status: "pending" as ComplianceStepStatus,
                          detail: undefined,
                        }))
                      );
                    }}
                    className="btn-secondary flex-1"
                  >
                    Send Another Payment
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
