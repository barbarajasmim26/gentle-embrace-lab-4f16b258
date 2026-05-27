import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Bell, Trash2, Archive, CheckCircle2, AlertTriangle, Info,
  Clock, DollarSign, FileText, Users, Settings
} from "lucide-react";

interface Notification {
  id: string;
  type: "payment" | "contract" | "maintenance" | "alert" | "info";
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  priority: "high" | "medium" | "low";
  actionUrl?: string;
}

export default function NotificationCenterPage() {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      type: "payment",
      title: "Pagamento Recebido",
      message: "João Silva pagou R$ 1.500,00 referente a fevereiro/2026",
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      read: false,
      priority: "high",
    },
    {
      id: "2",
      type: "alert",
      title: "Pagamento Atrasado",
      message: "Maria Santos está 5 dias em atraso com o aluguel de janeiro/2026",
      timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      read: false,
      priority: "high",
    },
    {
      id: "3",
      type: "contract",
      title: "Contrato Vencendo",
      message: "O contrato de Pedro Costa vence em 15 dias",
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      read: true,
      priority: "medium",
    },
  ]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const activeTab = unreadCount > 0 ? "unread" : "all";

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "payment":
        return <DollarSign className="h-5 w-5 text-emerald-600" />;
      case "contract":
        return <FileText className="h-5 w-5 text-blue-600" />;
      case "maintenance":
        return <Users className="h-5 w-5 text-orange-600" />;
      case "alert":
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      default:
        return <Info className="h-5 w-5 text-gray-600" />;
    }
  };

  const getNotificationBg = (type: string) => {
    switch (type) {
      case "payment":
        return "bg-emerald-50 border-emerald-200";
      case "contract":
        return "bg-blue-50 border-blue-200";
      case "maintenance":
        return "bg-orange-50 border-orange-200";
      case "alert":
        return "bg-red-50 border-red-200";
      default:
        return "bg-gray-50 border-gray-200";
    }
  };

  const handleMarkAsRead = (id: string) => {
    setNotifications(
      notifications.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map((n) => ({ ...n, read: true })));
    toast.success("Todas as notificações marcadas como lidas");
  };

  const handleDelete = (id: string) => {
    setNotifications(notifications.filter((n) => n.id !== id));
    toast.success("Notificação removida");
  };

  const handleDeleteAll = () => {
    if (confirm("Tem certeza que deseja deletar todas as notificações?")) {
      setNotifications([]);
      toast.success("Todas as notificações foram removidas");
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return "Agora";
    if (minutes < 60) return `${minutes}m atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days < 7) return `${days}d atrás`;
    return date.toLocaleDateString("pt-BR");
  };

  const unreadNotifications = notifications.filter((n) => !n.read);
  const readNotifications = notifications.filter((n) => n.read);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary relative">
            <Bell className="h-6 w-6" />
            {unreadCount > 0 && (
              <span className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                {unreadCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-2xl font-bold">Central de Notificações</h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount} notificação{unreadCount !== 1 ? "s" : ""} não lida{unreadCount !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={handleMarkAllAsRead}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Marcar Tudo como Lido
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDeleteAll}>
            <Trash2 className="mr-2 h-4 w-4" />
            Limpar Tudo
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue={activeTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="unread">
            Não Lidas ({unreadCount})
          </TabsTrigger>
          <TabsTrigger value="all">Todas ({notifications.length})</TabsTrigger>
        </TabsList>

        {/* Unread Tab */}
        <TabsContent value="unread" className="mt-4 space-y-3">
          {unreadNotifications.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-3 text-emerald-600" />
                <p className="text-muted-foreground">Você está em dia! Nenhuma notificação não lida.</p>
              </CardContent>
            </Card>
          ) : (
            unreadNotifications.map((notification) => (
              <Card
                key={notification.id}
                className={`border-l-4 cursor-pointer hover:shadow-md transition-shadow ${
                  notification.priority === "high"
                    ? "border-l-red-500 bg-red-50/30"
                    : "border-l-yellow-500 bg-yellow-50/30"
                }`}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">{getNotificationIcon(notification.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-semibold">{notification.title}</p>
                          <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(notification.timestamp)}
                          </p>
                        </div>
                        <Badge
                          variant={notification.priority === "high" ? "destructive" : "secondary"}
                          className="shrink-0"
                        >
                          {notification.priority === "high" ? "Urgente" : "Normal"}
                        </Badge>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMarkAsRead(notification.id)}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Marcar como Lida
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(notification.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* All Tab */}
        <TabsContent value="all" className="mt-4 space-y-3">
          {notifications.length === 0 ? (
            <Card>
              <CardContent className="pt-12 pb-12 text-center">
                <Bell className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-muted-foreground">Nenhuma notificação</p>
              </CardContent>
            </Card>
          ) : (
            notifications.map((notification) => (
              <Card
                key={notification.id}
                className={`border transition-all ${
                  notification.read ? "opacity-60" : ""
                } ${getNotificationBg(notification.type)}`}
              >
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">{getNotificationIcon(notification.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className={`font-semibold ${notification.read ? "text-muted-foreground" : ""}`}>
                            {notification.title}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(notification.timestamp)}
                          </p>
                        </div>
                        {!notification.read && (
                          <Badge variant="default" className="shrink-0">
                            Nova
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-2 mt-3">
                        {!notification.read && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkAsRead(notification.id)}
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Marcar como Lida
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(notification.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Notification Settings Info */}
      <Card className="bg-info/5 border-info/20">
        <CardContent className="pt-6 pb-6">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Sobre Notificações
          </h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>✓ <strong>Pagamentos:</strong> Receba alertas quando pagamentos forem recebidos</li>
            <li>✓ <strong>Atrasos:</strong> Notificações automáticas de pagamentos em atraso</li>
            <li>✓ <strong>Contratos:</strong> Lembretes de vencimento de contratos</li>
            <li>✓ <strong>Manutenção:</strong> Alertas sobre manutenção preventiva</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
