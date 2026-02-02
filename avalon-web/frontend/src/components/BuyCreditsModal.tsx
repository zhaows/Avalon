/**
 * Buy AI Credits Modal - 购买AI玩家额度弹窗
 */
import { useState, useEffect } from 'react';
import { paymentApi } from '../api';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';

interface Package {
  credits: number;
  price: number;
  price_yuan: number;
  description: string;
  unit_price: number;
}

interface BuyCreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BuyCreditsModal({ isOpen, onClose }: BuyCreditsModalProps) {
  const { token, user, updateUser } = useAuthStore();
  const [packages, setPackages] = useState<Package[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [loading, setLoading] = useState(false);
  const [orderInfo, setOrderInfo] = useState<{
    order_id: string;
    credits: number;
    amount_yuan: number;
  } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'wechat' | 'alipay'>('wechat');

  // 加载套餐列表
  useEffect(() => {
    if (isOpen) {
      loadPackages();
    }
  }, [isOpen]);

  const loadPackages = async () => {
    try {
      const response = await paymentApi.getPackages();
      setPackages(response.packages);
      if (response.packages.length > 0) {
        setSelectedPackage(response.packages[0]);
      }
    } catch (err) {
      toast.error('加载套餐失败');
    }
  };

  const handleCreateOrder = async () => {
    if (!token || !selectedPackage) return;
    
    setLoading(true);
    try {
      const response = await paymentApi.createOrder(
        token,
        selectedPackage.credits,
        paymentMethod
      );
      
      if (response.success) {
        setOrderInfo({
          order_id: response.order.order_id,
          credits: response.order.credits,
          amount_yuan: response.order.amount_yuan,
        });
        toast.info('订单已创建，请完成支付');
      }
    } catch (err: any) {
      toast.error(err.message || '创建订单失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!token || !orderInfo) return;
    
    setLoading(true);
    try {
      const response = await paymentApi.simulatePayment(token, orderInfo.order_id);
      
      if (response.success) {
        toast.success(response.message);
        // 更新用户信息
        if (response.user) {
          updateUser(response.user);
        }
        // 关闭弹窗
        setOrderInfo(null);
        onClose();
      }
    } catch (err: any) {
      toast.error(err.message || '支付失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOrderInfo(null);
    setSelectedPackage(packages[0] || null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="glass rounded-2xl p-6 w-full max-w-md fade-in max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <span>💎</span> 购买AI额度
          </h3>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white text-xl"
          >
            ×
          </button>
        </div>

        {/* 当前额度 */}
        <div className="bg-gray-800/50 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">当前额度</span>
            <span className="text-xl font-bold text-yellow-400">
              {user?.ai_credits || 0} 人次
            </span>
          </div>
        </div>

        {orderInfo ? (
          // 订单已创建，显示支付界面
          <div className="space-y-4">
            <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-4">
              <div className="text-center mb-4">
                <p className="text-gray-400 text-sm">订单号</p>
                <p className="text-white font-mono text-sm">{orderInfo.order_id}</p>
              </div>
              <div className="text-center">
                <p className="text-gray-400 text-sm">支付金额</p>
                <p className="text-3xl font-bold text-green-400">
                  ¥{orderInfo.amount_yuan.toFixed(2)}
                </p>
                <p className="text-gray-500 text-sm mt-1">
                  获得 {orderInfo.credits} 人次AI额度
                </p>
              </div>
            </div>

            {/* 模拟支付按钮（开发环境） */}
            <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-3">
              <p className="text-yellow-400 text-xs mb-2">
                ⚠️ 开发环境：点击下方按钮模拟支付成功
              </p>
              <button
                onClick={handleSimulatePayment}
                disabled={loading}
                className="w-full py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 
                         text-white font-bold rounded-lg transition-colors"
              >
                {loading ? '处理中...' : '✓ 模拟支付成功'}
              </button>
            </div>

            {/* TODO: 实际支付时显示二维码 */}
            {/* <div className="text-center">
              <p className="text-gray-400 text-sm mb-2">请使用{paymentMethod === 'wechat' ? '微信' : '支付宝'}扫码支付</p>
              <div className="bg-white p-4 inline-block rounded-lg">
                <QRCode value={payUrl} />
              </div>
            </div> */}

            <button
              onClick={() => setOrderInfo(null)}
              className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg"
            >
              返回选择套餐
            </button>
          </div>
        ) : (
          // 选择套餐
          <div className="space-y-4">
            {/* 套餐列表 */}
            <div className="space-y-2">
              {packages.map((pkg) => (
                <button
                  key={pkg.credits}
                  onClick={() => setSelectedPackage(pkg)}
                  className={`w-full p-3 rounded-lg border transition-all text-left ${
                    selectedPackage?.credits === pkg.credits
                      ? 'bg-purple-600/40 border-purple-500'
                      : 'bg-gray-700/50 border-transparent hover:bg-gray-600/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{pkg.description}</span>
                      <span className="text-gray-400 text-sm ml-2">
                        ¥{pkg.unit_price}/次
                      </span>
                    </div>
                    <span className="text-xl font-bold text-green-400">
                      ¥{pkg.price_yuan}
                    </span>
                  </div>
                  {pkg.credits >= 5 && (
                    <p className="text-xs text-yellow-400 mt-1">
                      💰 比单次购买节省 ¥{((1 - pkg.unit_price) * pkg.credits).toFixed(0)}
                    </p>
                  )}
                </button>
              ))}
            </div>

            {/* 支付方式 */}
            <div>
              <p className="text-sm text-gray-400 mb-2">支付方式</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPaymentMethod('wechat')}
                  className={`flex-1 p-2 rounded-lg border flex items-center justify-center gap-2 ${
                    paymentMethod === 'wechat'
                      ? 'bg-green-600/30 border-green-500'
                      : 'bg-gray-700/50 border-transparent'
                  }`}
                >
                  <span>💬</span> 微信支付
                </button>
                <button
                  onClick={() => setPaymentMethod('alipay')}
                  className={`flex-1 p-2 rounded-lg border flex items-center justify-center gap-2 ${
                    paymentMethod === 'alipay'
                      ? 'bg-blue-600/30 border-blue-500'
                      : 'bg-gray-700/50 border-transparent'
                  }`}
                >
                  <span>📱</span> 支付宝
                </button>
              </div>
            </div>

            {/* 购买按钮 */}
            <button
              onClick={handleCreateOrder}
              disabled={loading || !selectedPackage}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 
                       hover:from-purple-500 hover:to-blue-500 disabled:from-gray-600 
                       disabled:to-gray-600 text-white font-bold rounded-lg transition-all"
            >
              {loading ? '创建订单中...' : selectedPackage 
                ? `立即购买 ¥${selectedPackage.price_yuan}` 
                : '请选择套餐'}
            </button>

            <p className="text-xs text-gray-500 text-center">
              购买即表示同意《用户协议》和《隐私政策》
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
