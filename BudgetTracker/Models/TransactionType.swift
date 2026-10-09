import Foundation

enum TransactionType: String, Codable, CaseIterable, Identifiable {
    case expense
    case income

    var id: String { rawValue }

    var label: String {
        switch self {
        case .expense: return "Expense"
        case .income: return "Income"
        }
    }

    var symbol: String {
        switch self {
        case .expense: return "minus.circle.fill"
        case .income: return "plus.circle.fill"
        }
    }
}
