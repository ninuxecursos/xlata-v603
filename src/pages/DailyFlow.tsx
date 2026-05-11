import React, { useMemo, useEffect, useState, useRef } from 'react';
import { FeatureGuard } from '@/components/FeatureGuard';
import { FEATURE_KEYS } from '@/constants/featureAccess';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Calendar, DollarSign, Printer, Trash2, ShoppingCart, TrendingDown, FileText, TrendingUp, User } from 'lucide-react';
import ContextualHelpButton from '@/components/ContextualHelpButton';
import { getClosedCashRegistersWithSummary, CashFlowItem } from '@/utils/supabaseStorage';
import { useReceiptFormatSettings } from '@/hooks/useReceiptFormatSettings';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import PasswordPromptModal from '@/components/PasswordPromptModal';
import { toast } from '@/hooks/use-toast';
import { StandardFilter, FilterPeriod } from '@/components/StandardFilter';
import { MetricCard } from '@/components/MetricCard';
import { ReportPrintButton } from '@/components/ReportPrintButton';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useIsMobile } from '@/hooks/use-mobile';
import { useInfiniteScroll, useScrollLoadMore } from '@/hooks/useInfiniteScroll';
import CashFlowDetailsModal from '@/components/CashFlowDetailsModal';
import { useAdminViewState } from '@/hooks/useAdminView';
import { getClosedCashRegistersWithSummaryForUser } from '@/utils/adminDataAccess';
import { AdminViewBanner } from '@/components/admin/AdminViewBanner';

const DailyFlow = () => {
  const { getCurrentFormatSettings } = useReceiptFormatSettings();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [settings, setSettings] = useState<any>({});
  const [selectedPeriod, setSelectedPeriod] = useState<FilterPeriod>('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [dailyFlowData, setDailyFlowData] = useState<CashFlowItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [selectedOperator, setSelectedOperator] = useState<string>('all');
  const [selectedFlowItem, setSelectedFlowItem] = useState<CashFlowItem | null>(null);

  // Admin view state
  const { isAdminView, adminViewingUser, adminViewingUserName } = useAdminViewState();

  // Refs for virtualization
  const mobileParentRef = useRef<HTMLDivElement>(null);
  const desktopParentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadSystemSettings = async () => {
      if (!user) return;
      
      try {
        const { data: systemSettings } = await supabase
          .from('system_settings')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (systemSettings) {
          setSettings(systemSettings);
        }
      } catch (error) {
        console.error('Erro ao carregar configurações:', error);
      }
    };

    if (user) {
      loadSystemSettings();
    }
  }, [user]);

  // Optimized data loading - single query with pre-calculated summaries
  useEffect(() => {
    if (!user && !isAdminView) return;
    
    const loadDailyFlowData = async () => {
      setIsLoading(true);
      try {
        // Use admin data access when in admin view mode
        const flowData = isAdminView && adminViewingUser 
          ? await getClosedCashRegistersWithSummaryForUser(adminViewingUser)
          : await getClosedCashRegistersWithSummary();
        setDailyFlowData(flowData);
      } catch (error) {
        console.error('Error loading daily flow data:', error);
        setDailyFlowData([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadDailyFlowData();
  }, [user, isAdminView, adminViewingUser]);

  const filteredDailyFlowData = useMemo(() => {
    const now = new Date();
    let filterStartDate: Date;
    let filterEndDate: Date = new Date(now);
    filterEndDate.setHours(23, 59, 59, 999);

    if (selectedPeriod === 'custom' && startDate && endDate) {
      filterStartDate = new Date(startDate + 'T00:00:00');
      filterEndDate = new Date(endDate + 'T23:59:59.999');
    } else {
      switch (selectedPeriod) {
        case 'daily':
          filterStartDate = new Date(now);
          filterStartDate.setHours(0, 0, 0, 0);
          filterEndDate = new Date(now);
          filterEndDate.setHours(23, 59, 59, 999);
          break;
        case 'last30':
          filterStartDate = new Date(now);
          filterStartDate.setDate(now.getDate() - 30);
          filterStartDate.setHours(0, 0, 0, 0);
          break;
        case 'last60':
          filterStartDate = new Date(now);
          filterStartDate.setDate(now.getDate() - 60);
          filterStartDate.setHours(0, 0, 0, 0);
          break;
        case 'last90':
          filterStartDate = new Date(now);
          filterStartDate.setDate(now.getDate() - 90);
          filterStartDate.setHours(0, 0, 0, 0);
          break;
        case 'last365':
          filterStartDate = new Date(now);
          filterStartDate.setDate(now.getDate() - 365);
          filterStartDate.setHours(0, 0, 0, 0);
          break;
        default:
          filterStartDate = new Date(now);
          filterStartDate.setHours(0, 0, 0, 0);
          filterEndDate = new Date(now);
          filterEndDate.setHours(23, 59, 59, 999);
      }
    }

    return dailyFlowData.filter(item => {
      const referenceDate = item.closingDate || item.openingDate;
      const dateInRange = referenceDate >= filterStartDate && referenceDate <= filterEndDate;
      const operatorMatch = selectedOperator === 'all' || item.userName === selectedOperator;
      return dateInRange && operatorMatch;
    });
  }, [dailyFlowData, selectedPeriod, startDate, endDate, selectedOperator]);

  // Infinite scroll - exibe 20 itens por vez
  const { visibleItems, loadMore, hasMore, loadedCount, totalCount } = useInfiniteScroll({
    items: filteredDailyFlowData,
    pageSize: 20
  });

  // Virtualizers - agora usam visibleItems
  const mobileVirtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => mobileParentRef.current,
    estimateSize: () => 100,
    overscan: 5,
  });

  const desktopVirtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => desktopParentRef.current,
    estimateSize: () => 52,
    overscan: 5,
  });

  // Scroll load more triggers
  useScrollLoadMore(mobileParentRef, loadMore, hasMore);
  useScrollLoadMore(desktopParentRef, loadMore, hasMore);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('pt-BR');
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const totalSales = filteredDailyFlowData.reduce((sum, item) => sum + item.totalSales, 0);
  const totalPurchases = filteredDailyFlowData.reduce((sum, item) => sum + item.totalPurchases, 0);
  const totalExpenses = filteredDailyFlowData.reduce((sum, item) => sum + item.totalExpenses, 0);
  const totalDifference = filteredDailyFlowData.reduce((sum, item) => sum + item.difference, 0);
  const totalGrossProfit = filteredDailyFlowData.reduce((sum, item) => sum + item.grossProfit, 0);
  const totalNetProfit = filteredDailyFlowData.reduce((sum, item) => sum + item.netProfit, 0);

  const handleDeleteCashRegister = async () => {
    if (!itemToDelete || !user) return;

    try {
      const { error } = await supabase
        .from('cash_registers')
        .delete()
        .eq('id', itemToDelete)
        .eq('user_id', user.id);

      if (error) {
        toast({
          title: "Erro ao excluir",
          description: "Erro ao excluir fechamento de caixa.",
          variant: "destructive"
        });
        return;
      }

      const storedRegisters = localStorage.getItem(`cash_registers_${user.id}`);
      if (storedRegisters) {
        const registers = JSON.parse(storedRegisters);
        const updatedRegisters = registers.filter((reg: any) => reg.id !== itemToDelete);
        localStorage.setItem(`cash_registers_${user.id}`, JSON.stringify(updatedRegisters));
      }

      setDailyFlowData(prev => prev.filter(item => item.id !== itemToDelete));

      toast({
        title: "Fechamento excluído",
        description: "Fechamento de caixa excluído com sucesso.",
      });

      setShowPasswordModal(false);
      setItemToDelete(null);
    } catch (error) {
      toast({
        title: "Erro ao excluir",
        description: "Erro inesperado ao excluir fechamento.",
        variant: "destructive"
      });
    }
  };

  const confirmDelete = (itemId: string) => {
    setItemToDelete(itemId);
    setShowPasswordModal(true);
  };

  const printCashClosingReceipt = (item: any) => {
    const { logo, whatsapp1, whatsapp2, address } = settings;
    const formatSettings = getCurrentFormatSettings();

    const printContent = `
      <div style="width: ${formatSettings.container_width}; max-width: ${formatSettings.container_width}; margin: 0; padding: ${formatSettings.padding}; font-family: Arial, sans-serif; font-size: ${formatSettings.table_font_size}; color: #000; background: #fff;">
        ${logo ? `<div style="text-align: center; margin-bottom: 10px;"><img src="${logo}" alt="Logo" style="max-width: ${formatSettings.logo_max_width}; max-height: ${formatSettings.logo_max_height};" /></div>` : ''}
        <div style="text-align: center; font-weight: bold; font-size: ${formatSettings.title_font_size}; margin-bottom: 10px;">FECHAMENTO DE CAIXA</div>
        <div style="border-bottom: 2px solid #000; margin: 10px 0;"></div>
        <div style="margin-bottom: 10px;">
          <div><strong>Abertura:</strong> ${formatDate(item.openingDate)} ${formatTime(item.openingDate)}</div>
          <div><strong>Fechamento:</strong> ${item.closingDate ? formatDate(item.closingDate) + ' ' + formatTime(item.closingDate) : '-'}</div>
        </div>
        <div style="border-bottom: 1px solid #000; margin: 10px 0;"></div>
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td>Valor Inicial:</td><td style="text-align: right;">${formatCurrency(item.openingAmount)}</td></tr>
          <tr><td>Compras:</td><td style="text-align: right;">${formatCurrency(item.totalPurchases)}</td></tr>
          <tr><td>Vendas:</td><td style="text-align: right;">${formatCurrency(item.totalSales)}</td></tr>
          <tr><td>Despesas:</td><td style="text-align: right;">${formatCurrency(item.totalExpenses)}</td></tr>
          <tr><td>Esperado:</td><td style="text-align: right;">${formatCurrency(item.expectedAmount)}</td></tr>
          <tr><td>Final:</td><td style="text-align: right;">${formatCurrency(item.finalAmount)}</td></tr>
          <tr><td><strong>DIFERENÇA:</strong></td><td style="text-align: right; font-weight: bold; color: ${item.difference >= 0 ? '#10B981' : '#EF4444'};">${formatCurrency(item.difference)}</td></tr>
        </table>
      </div>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<!DOCTYPE html><html><head><title>Fechamento</title><style>*{margin:0;padding:0;box-sizing:border-box;}@page{margin:0;padding:0;}html,body{margin:0!important;padding:0!important;}@media print{html,body{min-height:auto!important;height:auto!important;}}</style></head><body onload="window.print(); window.close();">${printContent}</body></html>`);
      printWindow.document.close();
    }
  };

  const clearFilters = () => {
    setSelectedPeriod('daily');
    setStartDate('');
    setEndDate('');
    setSelectedOperator('all');
  };

  const uniqueOperators = useMemo(() => {
    const operators = dailyFlowData.map(item => item.userName);
    return [...new Set(operators)].sort();
  }, [dailyFlowData]);

  // Mobile: filtros compactos inline
  const ExtraFilters = isMobile ? (
    <div className="flex items-center gap-1.5">
      <Select value={selectedOperator} onValueChange={setSelectedOperator}>
        <SelectTrigger className="h-8 px-2 text-xs bg-slate-800 border-slate-600 text-white w-auto min-w-[70px] rounded-lg">
          <User className="h-3 w-3 mr-1 text-emerald-500" />
          <SelectValue placeholder="Op." />
        </SelectTrigger>
        <SelectContent className="bg-slate-800 border-slate-600">
          <SelectItem value="all" className="text-white text-xs">Todos</SelectItem>
          {uniqueOperators.map((operator) => (
            <SelectItem key={operator} value={operator} className="text-white text-xs">
              {operator.substring(0, 10)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-2">
      <div className="grid grid-cols-1 gap-2">
        <Label className="text-slate-300 text-sm">Operador</Label>
        <Select value={selectedOperator} onValueChange={setSelectedOperator}>
          <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
            <User className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent className="bg-slate-700 border-slate-600">
            <SelectItem value="all" className="text-white">Todos os Operadores</SelectItem>
            {uniqueOperators.map((operator) => (
              <SelectItem key={operator} value={operator} className="text-white">
                {operator}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );

  return (
    <FeatureGuard feature={FEATURE_KEYS.BASIC_REPORTS}>
    <div className="flex flex-col min-h-screen bg-slate-800">
      {/* Admin View Banner */}
      {isAdminView && (
        <div className="bg-slate-900 border-b border-slate-700 px-4 py-2">
          <AdminViewBanner 
            adminViewingUserName={adminViewingUserName}
            showBackToAdmin={true}
          />
        </div>
      )}
      
      <header className="bg-slate-900 text-white p-3 border-b border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors">
              <ArrowLeft className="h-5 w-5" />
              <span className="hidden sm:inline text-sm">Voltar</span>
            </Link>
            <h1 className="text-lg md:text-xl font-bold flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-500" />
              Fluxo Diário
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ReportPrintButton
              reportTitle="Fluxo de Caixa"
              period={{ label: selectedPeriod === 'daily' ? 'Hoje' : selectedPeriod === 'custom' ? `${startDate} a ${endDate}` : `Últimos ${selectedPeriod.replace('last', '')} dias` }}
              metrics={[
                { label: 'Total Vendas', value: formatCurrency(totalSales), color: '#10B981' },
                { label: 'Total Compras', value: formatCurrency(totalPurchases), color: '#3B82F6' },
                { label: 'Total Despesas', value: formatCurrency(totalExpenses), color: '#EF4444' },
                { label: 'Lucro Bruto', value: formatCurrency(totalGrossProfit), color: '#10B981' },
                { label: 'Lucro Líquido', value: formatCurrency(totalNetProfit), color: totalNetProfit >= 0 ? '#10B981' : '#EF4444' },
                { label: 'Nº Fechamentos', value: filteredDailyFlowData.length },
                { label: 'Diferença', value: formatCurrency(totalDifference), color: totalDifference >= 0 ? '#10B981' : '#EF4444' }
              ]}
            />
            <ContextualHelpButton module="caixa" />
          </div>
        </div>
      </header>

      <main className="flex-1 p-2 md:p-4 overflow-auto">
        {/* Filtro Padronizado */}
        <StandardFilter
          selectedPeriod={selectedPeriod}
          onPeriodChange={setSelectedPeriod}
          startDate={startDate}
          onStartDateChange={setStartDate}
          endDate={endDate}
          onEndDateChange={setEndDate}
          onClear={clearFilters}
          extraFilters={ExtraFilters}
        />

        {/* Resumo - Cards Compactos */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          <MetricCard
            icon={DollarSign}
            iconColor="text-emerald-500"
            label="Vendas"
            value={formatCurrency(totalSales)}
            compact
          />
          <MetricCard
            icon={ShoppingCart}
            iconColor="text-blue-500"
            label="Compras"
            value={formatCurrency(totalPurchases)}
            compact
          />
          <MetricCard
            icon={TrendingDown}
            iconColor="text-rose-500"
            label="Despesas"
            value={formatCurrency(totalExpenses)}
            compact
          />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <MetricCard
            icon={TrendingUp}
            iconColor="text-emerald-500"
            label="L. Bruto"
            value={formatCurrency(totalGrossProfit)}
            compact
          />
          <MetricCard
            icon={TrendingUp}
            iconColor={totalNetProfit >= 0 ? "text-emerald-500" : "text-rose-500"}
            label="L. Líquido"
            value={formatCurrency(totalNetProfit)}
            compact
          />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <MetricCard
            icon={FileText}
            iconColor="text-emerald-500"
            label="Fecham."
            value={filteredDailyFlowData.length}
            compact
          />
          <MetricCard
            icon={TrendingUp}
            iconColor={totalDifference >= 0 ? "text-emerald-500" : "text-rose-500"}
            label="Diferença"
            value={formatCurrency(totalDifference)}
            compact
          />
        </div>

        {/* Lista de Fechamentos */}
        <Card className="bg-slate-700 border-slate-600">
          <CardHeader className="p-3">
            <CardTitle className="text-white text-base md:text-lg">
              Histórico de Fechamentos <span className="text-slate-400 text-xs font-normal">({filteredDailyFlowData.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2 md:p-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                <p className="text-slate-400 text-sm">Carregando fechamentos...</p>
              </div>
            ) : filteredDailyFlowData.length > 0 ? (
              <>
                {/* Mobile View - Virtualized Cards */}
                <div 
                  ref={mobileParentRef}
                  className="md:hidden overflow-auto"
                  style={{ height: 'calc(100vh - 400px)', minHeight: '300px' }}
                >
                  <div
                    style={{
                      height: `${mobileVirtualizer.getTotalSize()}px`,
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    {mobileVirtualizer.getVirtualItems().map((virtualRow) => {
                      const item = visibleItems[virtualRow.index];
                      return (
                        <div
                          key={item.id}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          <Card 
                            className="bg-slate-800 border-slate-600 mx-0.5 cursor-pointer active:scale-[0.98] transition-transform"
                            onClick={() => setSelectedFlowItem(item)}
                          >
                            <CardContent className="p-2">
                              <div className="flex items-center justify-between mb-1.5">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className="w-7 h-7 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                                    <span className="text-white font-bold text-[10px]">
                                      {item.userName.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-white text-xs font-medium truncate max-w-[100px]">{item.userName}</p>
                                    <p className="text-slate-400 text-[10px]">
                                      {item.closingDate ? `${formatDate(item.closingDate)} ${formatTime(item.closingDate)}` : `${formatDate(item.openingDate)} ${formatTime(item.openingDate)}`}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <span className={`text-sm font-bold ${item.difference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {formatCurrency(item.difference)}
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="flex gap-3 text-[10px]">
                                    <span className="text-blue-400">C: {formatCurrency(item.totalPurchases)}</span>
                                    <span className="text-emerald-400">V: {formatCurrency(item.totalSales)}</span>
                                    <span className="text-rose-400">D: {formatCurrency(item.totalExpenses)}</span>
                                  </div>
                                  <div className="flex gap-3 text-[10px] mt-1">
                                    <span className="text-emerald-400">LB: {formatCurrency(item.grossProfit)}</span>
                                    <span className={item.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                      LL: {formatCurrency(item.netProfit)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); printCashClosingReceipt(item); }}
                                    className="h-6 w-6 p-0 text-slate-400 hover:text-emerald-400"
                                  >
                                    <Printer className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => { e.stopPropagation(); confirmDelete(item.id); }}
                                    className="h-6 w-6 p-0 text-slate-400 hover:text-rose-400"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Desktop View - Virtualized Div Table */}
                <div 
                  ref={desktopParentRef}
                  className="hidden md:block overflow-auto"
                  style={{ height: 'calc(100vh - 420px)', minHeight: '400px' }}
                >
                  {/* Header Row - Div based with improved spacing */}
                  <div className="sticky top-0 bg-slate-700 z-10 flex items-center gap-1 border-b border-slate-600 text-slate-300 text-xs font-medium">
                    <div className="p-2 w-[110px]">Operador</div>
                    <div className="p-2 w-[100px]">Data</div>
                    <div className="p-2 w-[95px] text-right">Inicial</div>
                    <div className="p-2 w-[95px] text-right">Compras</div>
                    <div className="p-2 w-[95px] text-right">Vendas</div>
                    <div className="p-2 w-[95px] text-right">Despesas</div>
                    <div className="p-2 w-[95px] text-right text-emerald-400">L. Bruto</div>
                    <div className="p-2 w-[95px] text-right text-emerald-400">L. Líquido</div>
                    <div className="p-2 w-[95px] text-right">Esperado</div>
                    <div className="p-2 w-[95px] text-right">Final</div>
                    <div className="p-2 w-[95px] text-right">Diferença</div>
                    <div className="p-2 w-[80px] text-center">Ações</div>
                  </div>
                  
                  {/* Virtual Rows */}
                  <div
                    style={{
                      height: `${desktopVirtualizer.getTotalSize()}px`,
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    {desktopVirtualizer.getVirtualItems().map((virtualRow) => {
                      const item = visibleItems[virtualRow.index];
                      return (
                        <div
                          key={item.id}
                          className="absolute left-0 w-full flex items-center gap-1 border-b border-slate-600 hover:bg-slate-600/50 cursor-pointer transition-colors"
                          style={{
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                          onClick={() => setSelectedFlowItem(item)}
                        >
                          <div className="text-slate-300 text-sm p-2 w-[110px]">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center flex-shrink-0">
                                <span className="text-white font-bold text-xs">
                                  {item.userName.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <span className="truncate max-w-[70px]">{item.userName}</span>
                            </div>
                          </div>
                          <div className="text-slate-300 text-sm p-2 w-[100px]">
                            <div>{item.closingDate ? formatDate(item.closingDate) : formatDate(item.openingDate)}</div>
                            <div className="text-xs text-slate-500">{item.closingDate ? formatTime(item.closingDate) : formatTime(item.openingDate)}</div>
                          </div>
                          <div className="text-slate-300 text-sm p-2 text-right w-[95px]">
                            {formatCurrency(item.openingAmount)}
                          </div>
                          <div className="text-blue-400 text-sm p-2 text-right w-[95px]">
                            {formatCurrency(item.totalPurchases)}
                          </div>
                          <div className="text-emerald-400 text-sm p-2 text-right w-[95px]">
                            {formatCurrency(item.totalSales)}
                          </div>
                          <div className="text-rose-400 text-sm p-2 text-right w-[95px]">
                            {formatCurrency(item.totalExpenses)}
                          </div>
                          <div className="text-emerald-400 text-sm p-2 text-right w-[95px]">
                            {formatCurrency(item.grossProfit)}
                          </div>
                          <div className={`text-sm p-2 text-right w-[95px] ${item.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatCurrency(item.netProfit)}
                          </div>
                          <div className="text-slate-300 text-sm p-2 text-right w-[95px]">
                            {formatCurrency(item.expectedAmount)}
                          </div>
                          <div className="text-white font-semibold text-sm p-2 text-right w-[95px]">
                            {formatCurrency(item.finalAmount)}
                          </div>
                          <div className={`font-semibold text-sm p-2 text-right w-[95px] ${item.difference >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatCurrency(item.difference)}
                          </div>
                          <div className="p-2 w-[80px]">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); printCashClosingReceipt(item); }}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-emerald-400"
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); confirmDelete(item.id); }}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-rose-400"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Count indicator */}
                <div className="text-sm text-slate-400 text-center mt-3">
                  Exibindo {loadedCount} de {totalCount} fechamentos
                  {hasMore && <span className="text-emerald-400 ml-2">(Role para carregar mais)</span>}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <Calendar className="h-12 w-12 text-slate-500" />
                <p className="text-slate-400 text-sm">Nenhum fechamento de caixa encontrado no período selecionado.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Modal de senha para exclusão */}
      <PasswordPromptModal
        open={showPasswordModal}
        onOpenChange={(open) => {
          setShowPasswordModal(open);
          if (!open) setItemToDelete(null);
        }}
        onAuthenticated={handleDeleteCashRegister}
        title="Excluir Fechamento"
        description="Digite a senha para confirmar a exclusão deste fechamento de caixa."
      />

      {/* Modal de detalhes do fluxo */}
      <CashFlowDetailsModal
        isOpen={!!selectedFlowItem}
        onClose={() => setSelectedFlowItem(null)}
        item={selectedFlowItem}
        onPrint={printCashClosingReceipt}
        onDelete={confirmDelete}
      />
    </div>
    </FeatureGuard>
  );
};

export default DailyFlow;
