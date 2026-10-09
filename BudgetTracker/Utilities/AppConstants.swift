import Foundation

enum AppConstants {
    static let expenseCategories = [
        "Groceries",
        "Rent",
        "Utilities",
        "Transport",
        "Dining",
        "Entertainment",
        "Healthcare",
        "Shopping",
        "Other"
    ]

    static let incomeCategories = [
        "Salary",
        "Freelance",
        "Bonus",
        "Refund",
        "Gift",
        "Investment",
        "Other"
    ]

    static func categories(for type: TransactionType) -> [String] {
        switch type {
        case .expense: return expenseCategories
        case .income: return incomeCategories
        }
    }

    static let currencyFormatter: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = Locale.current.currency?.identifier ?? "USD"
        return formatter
    }()

    static func formatCurrency(_ value: Double) -> String {
        currencyFormatter.string(from: NSNumber(value: value)) ?? String(format: "$%.2f", value)
    }
}
