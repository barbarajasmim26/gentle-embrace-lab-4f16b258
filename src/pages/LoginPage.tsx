import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Step = "form" | "otp";

export default function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("bbjasmim2@gmail.com");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      toast.error("Senha incorreta. Tente o código por e-mail abaixo.");
    }
  };

  const handleSendOtp = async () => {
    if (!email) { toast.error("Digite seu e-mail"); return; }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setStep("otp");
      toast.success("Código enviado para " + email);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) { toast.error("Digite o código completo"); return; }
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "email",
    });
    setLoading(false);
    if (error) {
      toast.error("Código inválido ou expirado. Solicite um novo.");
    }
  };

  if (step === "otp") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="text-4xl mb-2">📧</div>
            <CardTitle className="text-xl font-bold">Código enviado!</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Verifique o e-mail <strong>{email}</strong><br />
              (pode estar na pasta de spam)
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <Input
                type="text"
                inputMode="numeric"
                placeholder="Digite o código de 6 dígitos"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-2xl tracking-widest font-mono"
                maxLength={6}
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={loading || otp.length < 6}>
                {loading ? "Verificando..." : "Entrar"}
              </Button>
            </form>
            <Button
              variant="link"
              className="w-full mt-2 text-muted-foreground"
              onClick={() => { setStep("form"); setOtp(""); }}
            >
              ← Voltar
            </Button>
            <Button
              variant="link"
              className="w-full text-muted-foreground text-sm"
              disabled={loading}
              onClick={handleSendOtp}
            >
              Reenviar código
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="text-4xl mb-2">🏠</div>
          <CardTitle className="text-2xl font-bold">Mesquita Imóveis</CardTitle>
          <p className="text-muted-foreground text-sm">Entre na sua conta</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handlePasswordLogin} className="space-y-3">
            <Input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              type="password"
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando..." : "Entrar com senha"}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">ou</span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={loading}
            onClick={handleSendOtp}
          >
            📧 Receber código de 6 dígitos por e-mail
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Sem precisar de senha — só o código que chega no e-mail
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
